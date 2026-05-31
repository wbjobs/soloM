package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	pb "github.com/voxelviewer/backend/proto"
	"github.com/voxelviewer/backend/mca"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type server struct {
	pb.UnimplementedVoxelServiceServer
	worldPath string
}

func (s *server) GetRegion(ctx context.Context, req *pb.RegionRequest) (*pb.RegionData, error) {
	regionFileName := fmt.Sprintf("r.%d.%d.mca", req.RegionX, req.RegionZ)
	regionPath := filepath.Join(s.worldPath, "region", regionFileName)

	region, err := mca.OpenRegion(regionPath, int(req.RegionX), int(req.RegionZ))
	if err != nil {
		return &pb.RegionData{
			RegionX: req.RegionX,
			RegionZ: req.RegionZ,
		}, nil
	}

	var chunks []*pb.ChunkData
	for _, chunk := range region.Chunks {
		if chunk == nil || !chunk.Loaded {
			continue
		}
		pbChunk := &pb.ChunkData{
			ChunkX: int32(chunk.X),
			ChunkZ: int32(chunk.Z),
			Loaded: chunk.Loaded,
		}
		for _, block := range chunk.Blocks {
			pbChunk.Blocks = append(pbChunk.Blocks, &pb.Block{
				X:       int32(block.X),
				Y:       int32(block.Y),
				Z:       int32(block.Z),
				BlockId: int32(block.BlockID),
			})
		}
		chunks = append(chunks, pbChunk)
	}

	return &pb.RegionData{
		RegionX: req.RegionX,
		RegionZ: req.RegionZ,
		Chunks:  chunks,
	}, nil
}

func (s *server) GetChunk(ctx context.Context, req *pb.ChunkRequest) (*pb.ChunkData, error) {
	regionX := req.ChunkX >> 5
	regionZ := req.ChunkZ >> 5
	localX := req.ChunkX & 31
	localZ := req.ChunkZ & 31

	regionFileName := fmt.Sprintf("r.%d.%d.mca", regionX, regionZ)
	regionPath := filepath.Join(s.worldPath, "region", regionFileName)

	region, err := mca.OpenRegion(regionPath, int(regionX), int(regionZ))
	if err != nil {
		return &pb.ChunkData{
			ChunkX: req.ChunkX,
			ChunkZ: req.ChunkZ,
			Loaded: false,
		}, nil
	}

	chunkIndex := localZ*32 + localX
	if int(chunkIndex) >= len(region.Chunks) || region.Chunks[chunkIndex] == nil {
		return &pb.ChunkData{
			ChunkX: req.ChunkX,
			ChunkZ: req.ChunkZ,
			Loaded: false,
		}, nil
	}

	chunk := region.Chunks[chunkIndex]
	pbChunk := &pb.ChunkData{
		ChunkX: int32(chunk.X),
		ChunkZ: int32(chunk.Z),
		Loaded: chunk.Loaded,
	}
	for _, block := range chunk.Blocks {
		pbChunk.Blocks = append(pbChunk.Blocks, &pb.Block{
			X:       int32(block.X),
			Y:       int32(block.Y),
			Z:       int32(block.Z),
			BlockId: int32(block.BlockID),
		})
	}

	return pbChunk, nil
}

func (s *server) StreamRegion(req *pb.RegionRequest, stream pb.VoxelService_StreamRegionServer) error {
	regionFileName := fmt.Sprintf("r.%d.%d.mca", req.RegionX, req.RegionZ)
	regionPath := filepath.Join(s.worldPath, "region", regionFileName)

	region, err := mca.OpenRegion(regionPath, int(req.RegionX), int(req.RegionZ))
	if err != nil {
		return nil
	}

	for _, chunk := range region.Chunks {
		if chunk == nil || !chunk.Loaded {
			continue
		}
		pbChunk := &pb.ChunkData{
			ChunkX: int32(chunk.X),
			ChunkZ: int32(chunk.Z),
			Loaded: chunk.Loaded,
		}
		for _, block := range chunk.Blocks {
			pbChunk.Blocks = append(pbChunk.Blocks, &pb.Block{
				X:       int32(block.X),
				Y:       int32(block.Y),
				Z:       int32(block.Z),
				BlockId: int32(block.BlockID),
			})
		}
		if err := stream.Send(pbChunk); err != nil {
			return err
		}
	}

	return nil
}

type gRPCWebHandler struct {
	worldPath string
}

func (h *gRPCWebHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, x-grpc-web, grpc-encoding, grpc-timeout, accept")
	w.Header().Set("Access-Control-Expose-Headers", "grpc-status, grpc-message")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	contentType := r.Header.Get("Content-Type")
	if !strings.Contains(contentType, "application/grpc") {
		http.Error(w, "Invalid content type", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusInternalServerError)
		return
	}

	if len(body) < 5 {
		http.Error(w, "Invalid gRPC frame", http.StatusBadRequest)
		return
	}

	grpcBody := body[5:]
	serviceMethod := strings.TrimPrefix(r.URL.Path, "/")

	svc := &server{worldPath: h.worldPath}

	var respData []byte
	switch serviceMethod {
	case "voxel.VoxelService/GetRegion":
		req, err := pb.UnmarshalRegionRequest(grpcBody)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		resp, err := svc.GetRegion(r.Context(), req)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		respData, _ = resp.Marshal()

	case "voxel.VoxelService/GetChunk":
		req, err := pb.UnmarshalChunkRequest(grpcBody)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		resp, err := svc.GetChunk(r.Context(), req)
		if err != nil {
			writeGRPCError(w, err)
			return
		}
		respData, _ = resp.Marshal()

	default:
		http.Error(w, "Unknown method", http.StatusNotFound)
		return
	}

	frame := make([]byte, 5+len(respData))
	frame[0] = 0
	frame[1] = byte(len(respData) >> 24)
	frame[2] = byte(len(respData) >> 16)
	frame[3] = byte(len(respData) >> 8)
	frame[4] = byte(len(respData))
	copy(frame[5:], respData)

	w.Header().Set("Content-Type", "application/grpc-web+proto")
	w.Write(frame)

	trailer := []byte{0x80, 0x00, 0x00, 0x00, 0x02, 0x08, 0x00}
	w.Write(trailer)
}

func writeGRPCError(w http.ResponseWriter, err error) {
	st, ok := status.FromError(err)
	if !ok {
		st = status.New(codes.Internal, err.Error())
	}
	w.Header().Set("Grpc-Status", fmt.Sprintf("%d", st.Code()))
	w.Header().Set("Grpc-Message", st.Message())
	w.WriteHeader(http.StatusOK)
}

func main() {
	worldPath := os.Getenv("WORLD_PATH")
	if worldPath == "" {
		worldPath = "./world"
	}

	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	handler := &gRPCWebHandler{worldPath: worldPath}

	log.Printf("Voxel gRPC-Web server listening on :%s, world path: %s", httpPort, worldPath)
	if err := http.ListenAndServe(":"+httpPort, handler); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
