package bpf

import (
	"os"
)

func ReadBPFObject(path string) ([]byte, error) {
	return os.ReadFile(path)
}
