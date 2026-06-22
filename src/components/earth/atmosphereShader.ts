export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

export const atmosphereFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.2);
    vec3 innerColor = vec3(0.25, 0.55, 1.0);
    vec3 outerColor = vec3(0.1, 0.35, 0.9);
    vec3 col = mix(innerColor, outerColor, fresnel);
    float alpha = clamp(fresnel * 0.72, 0.0, 1.0);
    gl_FragColor = vec4(col * (fresnel * 1.9 + 0.1), alpha);
  }
`

export const atmosphereUniforms = {
  uColor:     { value: [0.25, 0.55, 1.0] },
  uIntensity: { value: 0.72 },
}
