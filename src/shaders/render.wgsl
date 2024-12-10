struct Camera {
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>
};

@binding(0) @group(0) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) quadPos: vec2<f32>,
    @location(2) worldPos: vec3<f32>,
    @location(3) viewPos: vec3<f32>
};

@vertex
fn vertexMain(
    @location(0) quadPos: vec2<f32>,
    @location(1) position: vec4<f32>,
    @location(2) velocity: vec4<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    // Larger particles for better overlap
    let particleSize = 0.2;
    
    let worldPos = camera.model * vec4<f32>(position.xyz, 1.0);
    let viewPos = (camera.view * worldPos).xyz;
    
    let billboardPos = viewPos + vec3<f32>(quadPos.x, quadPos.y, 0.0) * particleSize;
    
    output.position = camera.projection * vec4<f32>(billboardPos, 1.0);
    output.worldPos = worldPos.xyz;
    output.viewPos = viewPos;
    output.quadPos = quadPos;
    
    // Color based on density
    let density = position.w;
    let normalizedDensity = density / 1000.0;
    let lowColor = vec3<f32>(0.0, 0.0, 1.0);
    let highColor = vec3<f32>(1.0, 0.0, 0.0);
    output.color = vec4<f32>(mix(lowColor, highColor, normalizedDensity), 1.0);
    
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Calculate distance from center
    let distFromCenter = length(input.quadPos);
    
    // Create a more defined edge with smooth falloff
    let fieldStrength = 1.0 - smoothstep(0.0, 1.0, distFromCenter);
    
    // Sharp cutoff for solid appearance
    if (fieldStrength < 0.3) {
        discard;
    }

    // Calculate surface normal for lighting
    let normal = normalize(vec3<f32>(
        input.quadPos.x,
        input.quadPos.y,
        sqrt(max(1.0 - input.quadPos.x * input.quadPos.x - input.quadPos.y * input.quadPos.y, 0.0))
    ));

    // Enhanced lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let viewDir = normalize(-input.viewPos);
    let halfDir = normalize(lightDir + viewDir);
    
    // Lighting components
    let ambient = 0.2;
    let diffuse = max(dot(normal, lightDir), 0.0);
    let specular = pow(max(dot(normal, halfDir), 0.0), 32.0);
    
    let lighting = ambient + diffuse * 0.7 + specular * 0.3;
    
    // Edge softening
    let edgeSoftness = smoothstep(0.5, 0.7, fieldStrength);
    
    // Final color calculation

    return vec4<f32>(input.color.rgb * lighting, edgeSoftness);
}