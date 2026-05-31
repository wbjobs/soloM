package mca

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"encoding/binary"
	"fmt"
	"io"
	"os"
)

const (
	RegionChunkCount = 1024
	ChunkSizeX       = 16
	ChunkSizeZ       = 16
	ChunkSections    = 16
	SectionSize      = 16
)

type ChunkLocation struct {
	Offset uint32
	Size   uint8
}

type Block struct {
	X       int
	Y       int
	Z       int
	BlockID int
}

type Chunk struct {
	X      int
	Z      int
	Blocks []Block
	Loaded bool
}

type Region struct {
	X       int
	Z       int
	Chunks  [RegionChunkCount]*Chunk
	FilePath string
}

func OpenRegion(path string, rx, rz int) (*Region, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open region file: %w", err)
	}
	defer f.Close()

	region := &Region{
		X:        rx,
		Z:        rz,
		FilePath: path,
	}

	var locations [RegionChunkCount]ChunkLocation
	for i := 0; i < RegionChunkCount; i++ {
		var buf [4]byte
		if _, err := io.ReadFull(f, buf[:]); err != nil {
			return nil, fmt.Errorf("read location %d: %w", i, err)
		}
		val := binary.BigEndian.Uint32(buf[:])
		locations[i] = ChunkLocation{
			Offset: (val >> 8) * 4096,
			Size:   uint8(val & 0xFF),
		}
	}

	for i := 0; i < RegionChunkCount; i++ {
		loc := locations[i]
		if loc.Offset == 0 && loc.Size == 0 {
			continue
		}

		chunkX := rx*32 + (i % 32)
		chunkZ := rz*32 + (i / 32)

		chunk, err := readChunk(f, loc, chunkX, chunkZ)
		if err != nil {
			continue
		}
		region.Chunks[i] = chunk
	}

	return region, nil
}

func readChunk(f *os.File, loc ChunkLocation, cx, cz int) (*Chunk, error) {
	if _, err := f.Seek(int64(loc.Offset), io.SeekStart); err != nil {
		return nil, err
	}

	var lengthBuf [4]byte
	if _, err := io.ReadFull(f, lengthBuf[:]); err != nil {
		return nil, fmt.Errorf("read chunk length: %w", err)
	}
	length := binary.BigEndian.Uint32(lengthBuf[:])
	if length == 0 {
		return nil, fmt.Errorf("empty chunk")
	}

	var compressionType [1]byte
	if _, err := io.ReadFull(f, compressionType[:]); err != nil {
		return nil, fmt.Errorf("read compression type: %w", err)
	}

	compressedData := make([]byte, length-1)
	if _, err := io.ReadFull(f, compressedData); err != nil {
		return nil, fmt.Errorf("read compressed data: %w", err)
	}

	var reader io.ReadCloser
	var err error
	switch compressionType[0] {
	case 1:
		reader, err = gzip.NewReader(bytes.NewReader(compressedData))
	case 2:
		reader, err = zlib.NewReader(bytes.NewReader(compressedData))
	default:
		return nil, fmt.Errorf("unknown compression type: %d", compressionType[0])
	}
	if err != nil {
		return nil, fmt.Errorf("create decompressor: %w", err)
	}
	defer reader.Close()

	nbtData, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("decompress: %w", err)
	}

	blocks, err := parseChunkNBT(nbtData, cx, cz)
	if err != nil {
		return nil, fmt.Errorf("parse NBT: %w", err)
	}

	return &Chunk{
		X:      cx,
		Z:      cz,
		Blocks: blocks,
		Loaded: true,
	}, nil
}

func parseChunkNBT(data []byte, cx, cz int) ([]Block, error) {
	tag, _, err := ReadNBT(data)
	if err != nil {
		return nil, err
	}

	root, ok := tag.(*CompoundTag)
	if !ok {
		return nil, fmt.Errorf("root tag is not compound")
	}

	level, ok := root.Get("Level").(*CompoundTag)
	if !ok {
		return nil, fmt.Errorf("Level tag not found or not compound")
	}

	var blocks []Block

	sectionsTag, ok := level.Get("Sections").(*ListTag)
	if !ok {
		sectionsTag, ok = level.Get("sections").(*ListTag)
		if !ok {
			return nil, fmt.Errorf("Sections tag not found")
		}
	}

	for _, sectionEntry := range sectionsTag.Entries {
		section, ok := sectionEntry.(*CompoundTag)
		if !ok {
			continue
		}

		var y int8
		if yTag, ok := section.Get("Y").(*ByteTag); ok {
			y = int8(yTag.Value)
		} else if yTag, ok := section.Get("Y").(*IntTag); ok {
			y = int8(yTag.Value)
		} else {
			continue
		}

		if palette, ok := section.Get("Palette").(*ListTag); ok {
			blockStates, ok := section.Get("BlockStates").(*LongArrayTag)
			if !ok {
				continue
			}
			sectionBlocks := parsePaletteBlocks(palette, blockStates, cx, cz, int(y))
			blocks = append(blocks, sectionBlocks...)
			continue
		}

		if blocksTag, ok := section.Get("Blocks").(*ByteArrayTag); ok {
			dataTag, _ := section.Get("Data").(*ByteArrayTag)
			sectionBlocks := parseLegacyBlocks(blocksTag, dataTag, cx, cz, int(y))
			blocks = append(blocks, sectionBlocks...)
		}
	}

	return blocks, nil
}

func parsePaletteBlocks(palette *ListTag, blockStates *LongArrayTag, cx, cz, sectionY int) []Block {
	if len(palette.Entries) == 0 || len(blockStates.Data) == 0 {
		return nil
	}

	paletteEntries := make([]int, len(palette.Entries))
	for i, entry := range palette.Entries {
		if compound, ok := entry.(*CompoundTag); ok {
			if nameTag, ok := compound.Get("Name").(*StringTag); ok {
				paletteEntries[i] = BlockNameToID(nameTag.Value)
			}
		}
	}

	bitsPerEntry := 4
	for (1 << bitsPerEntry) < len(paletteEntries) {
		bitsPerEntry++
	}
	if bitsPerEntry < 4 {
		bitsPerEntry = 4
	}

	var blocks []Block
	valuesPerLong := 64 / bitsPerEntry
	mask := int64((1 << bitsPerEntry) - 1)

	idx := 0
	for _, longVal := range blockStates.Data {
		for bitIdx := 0; bitIdx < valuesPerLong && idx < 4096; bitIdx++ {
			paletteIndex := int((longVal >> (bitIdx * bitsPerEntry)) & mask)
			if paletteIndex < len(paletteEntries) && paletteEntries[paletteIndex] != 0 {
				localX := idx & 0xF
				localZ := (idx >> 4) & 0xF
				localY := idx >> 8

				worldX := cx*16 + localX
				worldY := sectionY*16 + localY
				worldZ := cz*16 + localZ

				blocks = append(blocks, Block{
					X:       worldX,
					Y:       worldY,
					Z:       worldZ,
					BlockID: paletteEntries[paletteIndex],
				})
			}
			idx++
		}
	}

	return blocks
}

func parseLegacyBlocks(blocksTag *ByteArrayTag, dataTag *ByteArrayTag, cx, cz, sectionY int) []Block {
	var blocks []Block
	for x := 0; x < SectionSize; x++ {
		for z := 0; z < SectionSize; z++ {
			for y := 0; y < SectionSize; y++ {
				idx := y + z*SectionSize + x*SectionSize*SectionSize
				if idx >= len(blocksTag.Data) {
					continue
				}
				blockID := int(blocksTag.Data[idx])
				if blockID == 0 {
					continue
				}
				blocks = append(blocks, Block{
					X:       cx*16 + x,
					Y:       sectionY*16 + y,
					Z:       cz*16 + z,
					BlockID: blockID,
				})
			}
		}
	}
	return blocks
}

func BlockNameToID(name string) int {
	blockMap := map[string]int{
		"minecraft:stone":             1,
		"minecraft:granite":           1,
		"minecraft:polished_granite":  1,
		"minecraft:diorite":           1,
		"minecraft:polished_diorite":  1,
		"minecraft:andesite":          1,
		"minecraft:polished_andesite": 1,
		"minecraft:grass_block":       2,
		"minecraft:dirt":              3,
		"minecraft:coarse_dirt":       3,
		"minecraft:podzol":            3,
		"minecraft:cobblestone":       4,
		"minecraft:oak_planks":        5,
		"minecraft:spruce_planks":     5,
		"minecraft:birch_planks":      5,
		"minecraft:jungle_planks":     5,
		"minecraft:bedrock":           7,
		"minecraft:sand":              12,
		"minecraft:red_sand":          12,
		"minecraft:gravel":            13,
		"minecraft:gold_ore":          14,
		"minecraft:iron_ore":          15,
		"minecraft:coal_ore":          16,
		"minecraft:oak_log":           17,
		"minecraft:spruce_log":        17,
		"minecraft:birch_log":         17,
		"minecraft:jungle_log":        17,
		"minecraft:oak_leaves":        18,
		"minecraft:spruce_leaves":     18,
		"minecraft:birch_leaves":      18,
		"minecraft:jungle_leaves":     18,
		"minecraft:lapis_ore":         21,
		"minecraft:sandstone":         24,
		"minecraft:water":             9,
		"minecraft:lava":              11,
		"minecraft:oak_door":          64,
		"minecraft:glass":             20,
		"minecraft:diamond_ore":       56,
		"minecraft:emerald_ore":       129,
		"minecraft:redstone_ore":      73,
		"minecraft:snow_block":        80,
		"minecraft:ice":               79,
		"minecraft:clay":              82,
		"minecraft:pumpkin":           86,
		"minecraft:netherrack":        87,
		"minecraft:soul_sand":         88,
		"minecraft:glowstone":         89,
		"minecraft:obsidian":          49,
	}
	if id, ok := blockMap[name]; ok {
		return id
	}
	return 1
}
