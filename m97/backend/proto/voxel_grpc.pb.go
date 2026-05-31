package voxel

import (
	"context"
)

type VoxelServiceServer interface {
	GetRegion(context.Context, *RegionRequest) (*RegionData, error)
	GetChunk(context.Context, *ChunkRequest) (*ChunkData, error)
	StreamRegion(*RegionRequest, VoxelService_StreamRegionServer) error
}

type VoxelService_StreamRegionServer interface {
	Send(*ChunkData) error
	Context() context.Context
}

type UnimplementedVoxelServiceServer struct{}

func (UnimplementedVoxelServiceServer) GetRegion(context.Context, *RegionRequest) (*RegionData, error) {
	return nil, nil
}

func (UnimplementedVoxelServiceServer) GetChunk(context.Context, *ChunkRequest) (*ChunkData, error) {
	return nil, nil
}

func (UnimplementedVoxelServiceServer) StreamRegion(*RegionRequest, VoxelService_StreamRegionServer) error {
	return nil
}

type streamRegionServer struct {
}

func (s *streamRegionServer) Send(*ChunkData) error {
	return nil
}

func (s *streamRegionServer) Context() context.Context {
	return context.Background()
}

func NewVoxelServiceClient(_ interface{}) VoxelServiceClient {
	return VoxelServiceClient{}
}

type VoxelServiceClient struct{}

func (c VoxelServiceClient) GetRegion(ctx context.Context, req *RegionRequest, _ ...interface{}) (*RegionData, error) {
	return nil, nil
}

func (c VoxelServiceClient) GetChunk(ctx context.Context, req *ChunkRequest, _ ...interface{}) (*ChunkData, error) {
	return nil, nil
}
