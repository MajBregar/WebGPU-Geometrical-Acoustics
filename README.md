# WebGPU Geometrical Acoustics
A simple WebGPU-based simulation of geometrical acoustics. 


# TODO
- add sphere models for emitter and listener, hook them up to pipeline, expose their position and direction in compute shader
- add ray soaking into listener (ignore dir for now), hook up listener energy output to CPU
- add graph for input energies and listener output energies

- switch to ID based voxel mapping - voxels should only hold voxelTypeID, add propery translation table as input to shader
- READ PAPER MORE IN DEPTH - make sound rays physically accurate
- implement sound transform into energy bands as input vectors
- hook up vector input to compute shader
- implement sound detransform from listener energy bands into sound

- IF HAVE TIME - implement head transfer function for listener

