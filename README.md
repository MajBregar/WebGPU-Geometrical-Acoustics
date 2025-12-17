# WebGPU Geometrical Acoustics
A simple WebGPU-based simulation of geometrical acoustics. 


# TODO
- READ PAPER MORE IN DEPTH - make sound rays physically accurate

- IF HAVE TIME - implement head transfer function for listener



# PHYISICALLY BASED RAYS 
- Distance attenuation (inverse square law)
- Surface absorption (per band)
- Specular reflection (law of reflection)
- Diffuse scattering (optional but recommended)
- Transmission for wavelengths ≥ object size (simple passthrough)
- Diffraction at edges (single ray bend OR child ray)
- Per-ray delay = distance / speed of sound

- Accumulate energy per direction at listener (cubemap or equivalent)
- Energy cutoff threshold (stop low-energy rays)
- Max bounce count (prevent infinite recursion)


# CREDITS 
- glm.js
- https://github.com/indutny/fft.js
