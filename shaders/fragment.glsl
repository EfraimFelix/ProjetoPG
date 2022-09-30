#version 300 es
  precision highp float;

  in vec3 v_normal;
  in vec4 v_color;

  uniform vec3 u_lightDirection;

  out vec4 outColor;

  void main () {
    vec3 normal = normalize(v_normal);
    float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
    outColor = vec4(v_color.rgb * fakeLight, 1);
  }