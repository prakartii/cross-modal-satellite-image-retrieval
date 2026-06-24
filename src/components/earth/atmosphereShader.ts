export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vFresnel;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    // Pre-compute Fresnel for fragment
    float c = 1.0 - abs(dot(normalize(vNormal), normalize(-mvPosition.xyz)));
    vFresnel = pow(c, 3.8);

    gl_Position = projectionMatrix * mvPosition;
  }
`

export const atmosphereFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vFresnel;

  void main() {
    float c = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float fresnel = pow(c, 3.8);

    // Rayleigh-like blue scattering — thicker near limb
    vec3 scatterBlue  = vec3(0.12, 0.40, 0.92);   // inner limb sky blue
    vec3 scatterDeep  = vec3(0.04, 0.15, 0.55);   // outer dark blue
    // Subtle bright rim right at the very edge (city-lights-visible terminator analog)
    float rim = pow(c, 9.0);
    vec3 rimColor = vec3(0.38, 0.62, 1.0);

    vec3 col = mix(scatterBlue, scatterDeep, fresnel * 0.6);
    col += rimColor * rim * 0.55;

    // Alpha: moderate band, slightly transparent so Earth color shows
    float alpha = clamp(fresnel * 0.62 + rim * 0.10, 0.0, 0.82);

    // Thin out the atmosphere near dead-center (avoid haze on dayside face)
    alpha *= smoothstep(0.02, 0.18, c);

    gl_FragColor = vec4(col, alpha);
  }
`

export const atmosphereUniforms = {
  uColor:     { value: [0.12, 0.40, 0.92] },
  uIntensity: { value: 0.62 },
}
