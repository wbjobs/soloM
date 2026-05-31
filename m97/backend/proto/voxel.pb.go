package voxel

import (
	"fmt"
	"io"
	"math"

	"google.golang.org/protobuf/encoding/protowire"
)

type Block struct {
	X       int32
	Y       int32
	Z       int32
	BlockId int32
}

func (m *Block) Marshal() ([]byte, error) {
	var data []byte
	if m.X != 0 {
		data = protowire.AppendTag(data, 1, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.X))
	}
	if m.Y != 0 {
		data = protowire.AppendTag(data, 2, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.Y))
	}
	if m.Z != 0 {
		data = protowire.AppendTag(data, 3, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.Z))
	}
	if m.BlockId != 0 {
		data = protowire.AppendTag(data, 4, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.BlockId))
	}
	return data, nil
}

type ChunkData struct {
	ChunkX int32
	ChunkZ int32
	Blocks []*Block
	Loaded bool
}

func (m *ChunkData) Marshal() ([]byte, error) {
	var data []byte
	if m.ChunkX != 0 {
		data = protowire.AppendTag(data, 1, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.ChunkX))
	}
	if m.ChunkZ != 0 {
		data = protowire.AppendTag(data, 2, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.ChunkZ))
	}
	for _, block := range m.Blocks {
		blockData, err := block.Marshal()
		if err != nil {
			return nil, err
		}
		data = protowire.AppendTag(data, 3, protowire.BytesType)
		data = protowire.AppendBytes(data, blockData)
	}
	if m.Loaded {
		data = protowire.AppendTag(data, 4, protowire.VarintType)
		data = protowire.AppendVarint(data, 1)
	}
	return data, nil
}

type RegionData struct {
	RegionX int32
	RegionZ int32
	Chunks  []*ChunkData
}

func (m *RegionData) Marshal() ([]byte, error) {
	var data []byte
	if m.RegionX != 0 {
		data = protowire.AppendTag(data, 1, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.RegionX))
	}
	if m.RegionZ != 0 {
		data = protowire.AppendTag(data, 2, protowire.VarintType)
		data = protowire.AppendVarint(data, uint64(m.RegionZ))
	}
	for _, chunk := range m.Chunks {
		chunkData, err := chunk.Marshal()
		if err != nil {
			return nil, err
		}
		data = protowire.AppendTag(data, 3, protowire.BytesType)
		data = protowire.AppendBytes(data, chunkData)
	}
	return data, nil
}

type RegionRequest struct {
	RegionX   int32
	RegionZ   int32
	WorldPath string
}

type ChunkRequest struct {
	ChunkX   int32
	ChunkZ   int32
	WorldPath string
}

func UnmarshalRegionRequest(data []byte) (*RegionRequest, error) {
	req := &RegionRequest{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return nil, fmt.Errorf("consume tag: %v", protowire.ParseError(n))
		}
		data = data[n:]
		switch num {
		case 1:
			v, n := protowire.ConsumeVarint(data)
			if n < 0 {
				return nil, fmt.Errorf("consume varint: %v", protowire.ParseError(n))
			}
			data = data[n:]
			req.RegionX = int32(v)
		case 2:
			v, n := protowire.ConsumeVarint(data)
			if n < 0 {
				return nil, fmt.Errorf("consume varint: %v", protowire.ParseError(n))
			}
			data = data[n:]
			req.RegionZ = int32(v)
		case 3:
			v, n := protowire.ConsumeBytes(data)
			if n < 0 {
				return nil, fmt.Errorf("consume bytes: %v", protowire.ParseError(n))
			}
			data = data[n:]
			req.WorldPath = string(v)
		default:
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				return nil, fmt.Errorf("skip field: %v", protowire.ParseError(n))
			}
			data = data[n:]
		}
	}
	return req, nil
}

func UnmarshalChunkRequest(data []byte) (*ChunkRequest, error) {
	req := &ChunkRequest{}
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return nil, fmt.Errorf("consume tag: %v", protowire.ParseError(n))
		}
		data = data[n:]
		switch num {
		case 1:
			v, n := protowire.ConsumeVarint(data)
			if n < 0 {
				return nil, fmt.Errorf("consume varint: %v", protowire.ParseError(n))
			}
			data = data[n:]
			req.ChunkX = int32(v)
		case 2:
			v, n := protowire.ConsumeVarint(data)
			if n < 0 {
				return nil, fmt.Errorf("consume varint: %v", protowire.ParseError(n))
			}
			data = data[n:]
			req.ChunkZ = int32(v)
		case 3:
			v, n := protowire.ConsumeBytes(data)
			if n < 0 {
				return nil, fmt.Errorf("consume bytes: %v", protowire.ParseError(n))
			}
			data = data[n:]
			req.WorldPath = string(v)
		default:
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				return nil, fmt.Errorf("skip field: %v", protowire.ParseError(n))
			}
			data = data[n:]
		}
	}
	return req, nil
}

var _ = io.EOF
var _ = math.Inf
