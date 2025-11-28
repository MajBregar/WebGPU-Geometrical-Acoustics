# WebGPU Geometrical Acoustics
A simple WebGPU-based simulation of geometrical acoustics. 




# PLAN FOR RAYTRACING PIPELINE

- make buffer of every voxel in room that stores Voxel(material_coef), the position of the voxel in the array should be translatable to the voxel boundries
- make a translation buffer of every voxel to a compressed voxel buffer index - translation\[voxelnd\] = compressedInd
- use compressedInd * 6 + FaceID to get position of the readback buffer data and ATOMIC WRITE in the absorption data
- after ray tracing step send the readback buffer data to CPU -> decode into face colors

