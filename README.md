# WebGPU Geometrical Acoustics
A simple WebGPU-based simulation of geometrical acoustics. 


# TODO
- READ PAPER MORE IN DEPTH - make sound rays physically accurate
- implement sound transform into energy bands as input vectors
- hook up vector input to compute shader
- implement sound detransform from listener energy bands into sound

- IF HAVE TIME - implement head transfer function for listener



# PHYISICALLY BASED RAYS 
- Distance attenuation (inverse square law)
- Surface absorption (per band)
- Specular reflection (law of reflection)
- Diffuse scattering (optional but recommended)
- Transmission for wavelengths ≥ object size (simple passthrough)
- Diffraction at edges (single ray bend OR child ray)
- Max bounce count (prevent infinite recursion)
- Per-ray delay = distance / speed of sound

- Accumulate energy per direction at listener (cubemap or equivalent)
- Energy cutoff threshold (stop low-energy rays)
