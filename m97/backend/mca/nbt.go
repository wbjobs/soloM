package mca

import (
	"encoding/binary"
	"fmt"
)

type TagType byte

const (
	TagEnd       TagType = 0
	TagByte      TagType = 1
	TagShort     TagType = 2
	TagInt       TagType = 3
	TagLong      TagType = 4
	TagFloat     TagType = 5
	TagDouble    TagType = 6
	TagByteArray TagType = 7
	TagString    TagType = 8
	TagList      TagType = 9
	TagCompound  TagType = 10
	TagIntArray  TagType = 11
	TagLongArray TagType = 12
)

type Tag interface {
	Type() TagType
}

type EndTag struct{}

func (t *EndTag) Type() TagType { return TagEnd }

type ByteTag struct {
	Name  string
	Value int8
}

func (t *ByteTag) Type() TagType { return TagByte }

type ShortTag struct {
	Name  string
	Value int16
}

func (t *ShortTag) Type() TagType { return TagShort }

type IntTag struct {
	Name  string
	Value int32
}

func (t *IntTag) Type() TagType { return TagInt }

type LongTag struct {
	Name  string
	Value int64
}

func (t *LongTag) Type() TagType { return TagLong }

type FloatTag struct {
	Name  string
	Value float32
}

func (t *FloatTag) Type() TagType { return TagFloat }

type DoubleTag struct {
	Name  string
	Value float64
}

func (t *DoubleTag) Type() TagType { return TagDouble }

type ByteArrayTag struct {
	Name  string
	Data  []int8
}

func (t *ByteArrayTag) Type() TagType { return TagByteArray }

type StringTag struct {
	Name  string
	Value string
}

func (t *StringTag) Type() TagType { return TagString }

type ListTag struct {
	Name       string
	ListType   TagType
	Entries    []Tag
}

func (t *ListTag) Type() TagType { return TagList }

type CompoundTag struct {
	Name     string
	Children map[string]Tag
}

func (t *CompoundTag) Type() TagType { return TagCompound }

func (t *CompoundTag) Get(key string) Tag {
	if t.Children == nil {
		return nil
	}
	return t.Children[key]
}

type IntArrayTag struct {
	Name  string
	Data  []int32
}

func (t *IntArrayTag) Type() TagType { return TagIntArray }

type LongArrayTag struct {
	Name  string
	Data  []int64
}

func (t *LongArrayTag) Type() TagType { return TagLongArray }

type nbtReader struct {
	data   []byte
	offset int
}

func ReadNBT(data []byte) (Tag, string, error) {
	r := &nbtReader{data: data}
	tagType := TagType(r.readByte())
	if tagType == TagEnd {
		return &EndTag{}, "", nil
	}
	name := r.readString()
	tag, err := r.readPayload(tagType)
	if err != nil {
		return nil, "", err
	}
	return tag, name, nil
}

func (r *nbtReader) readByte() byte {
	if r.offset >= len(r.data) {
		return 0
	}
	b := r.data[r.offset]
	r.offset++
	return b
}

func (r *nbtReader) readShort() int16 {
	b := r.readBytes(2)
	return int16(binary.BigEndian.Uint16(b))
}

func (r *nbtReader) readInt() int32 {
	b := r.readBytes(4)
	return int32(binary.BigEndian.Uint32(b))
}

func (r *nbtReader) readLong() int64 {
	b := r.readBytes(8)
	return int64(binary.BigEndian.Uint64(b))
}

func (r *nbtReader) readFloat() float32 {
	b := r.readBytes(4)
	return float32(binary.BigEndian.Uint32(b))
}

func (r *nbtReader) readDouble() float64 {
	b := r.readBytes(8)
	return float64(binary.BigEndian.Uint64(b))
}

func (r *nbtReader) readBytes(n int) []byte {
	if r.offset+n > len(r.data) {
		n = len(r.data) - r.offset
	}
	b := r.data[r.offset : r.offset+n]
	r.offset += n
	return b
}

func (r *nbtReader) readString() string {
	length := r.readShort()
	if length <= 0 {
		return ""
	}
	b := r.readBytes(int(length))
	return string(b)
}

func (r *nbtReader) readPayload(tagType TagType) (Tag, error) {
	switch tagType {
	case TagByte:
		return &ByteTag{Value: int8(r.readByte())}, nil
	case TagShort:
		return &ShortTag{Value: r.readShort()}, nil
	case TagInt:
		return &IntTag{Value: r.readInt()}, nil
	case TagLong:
		return &LongTag{Value: r.readLong()}, nil
	case TagFloat:
		return &FloatTag{Value: r.readFloat()}, nil
	case TagDouble:
		return &DoubleTag{Value: r.readDouble()}, nil
	case TagByteArray:
		length := r.readInt()
		data := make([]int8, length)
		for i := int32(0); i < length; i++ {
			data[i] = int8(r.readByte())
		}
		return &ByteArrayTag{Data: data}, nil
	case TagString:
		return &StringTag{Value: r.readString()}, nil
	case TagList:
		listType := TagType(r.readByte())
		length := r.readInt()
		entries := make([]Tag, 0, length)
		for i := int32(0); i < length; i++ {
			entry, err := r.readPayload(listType)
			if err != nil {
				return nil, err
			}
			entries = append(entries, entry)
		}
		return &ListTag{ListType: listType, Entries: entries}, nil
	case TagCompound:
		children := make(map[string]Tag)
		for {
			childType := TagType(r.readByte())
			if childType == TagEnd {
				break
			}
			name := r.readString()
			payload, err := r.readPayload(childType)
			if err != nil {
				return nil, fmt.Errorf("read tag %s: %w", name, err)
			}
			children[name] = payload
		}
		return &CompoundTag{Children: children}, nil
	case TagIntArray:
		length := r.readInt()
		data := make([]int32, length)
		for i := int32(0); i < length; i++ {
			data[i] = r.readInt()
		}
		return &IntArrayTag{Data: data}, nil
	case TagLongArray:
		length := r.readInt()
		data := make([]int64, length)
		for i := int32(0); i < length; i++ {
			data[i] = r.readLong()
		}
		return &LongArrayTag{Data: data}, nil
	default:
		return nil, fmt.Errorf("unknown tag type: %d", tagType)
	}
}
