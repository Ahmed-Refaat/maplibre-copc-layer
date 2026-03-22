varying vec3 vColor;
varying float vFiltered;

void main() {
    if (vFiltered > 0.5) {
        discard;
    }

    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    if (dot(cxy, cxy) > 1.0) {
        discard;
    }

    gl_FragColor = vec4(vColor, 1.0);
}
