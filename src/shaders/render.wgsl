struct Camera {
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>
};

@binding(0) @group(0) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) texCoord: vec2<f32>,
    @location(2) normal: vec3<f32>
};

@vertex
fn vertexMain(
    @location(0) quadPos: vec2<f32>,
    @location(1) position: vec4<f32>,
    @location(2) velocity: vec4<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    // Particle size
    let particleSize = 0.05;
    
    // Transform particle position to view space
    let worldPos = camera.model * vec4<f32>(position.xyz, 1.0);
    let viewPos = (camera.view * worldPos).xyz;
    
    // Calculate billboard position
    let billboardPos = viewPos + vec3<f32>(quadPos.x, quadPos.y, 0.0) * particleSize;
    
    // Project to screen space
    output.position = camera.projection * vec4<f32>(billboardPos, 1.0);
    
    // Color mapping based on density
    let normalizedDensity = position.w / 1000.0;
    let lowColor = vec3<f32>(0.0, 0.0, 1.0);  // Blue
    let highColor = vec3<f32>(1.0, 0.0, 0.0); // Red
    let color = mix(lowColor, highColor, normalizedDensity);
    output.color = vec4<f32>(color, 1.0);
    
    // Pass texture coordinates for sphere shaping
    output.texCoord = quadPos * 0.5 + 0.5;
    
    // Calculate normal for lighting
    output.normal = normalize(vec3<f32>(quadPos.x, quadPos.y, 1.0));
    
    return output;
}

@fragment
fn fragmentMain(
    @location(0) color: vec4<f32>,
    @location(1) texCoord: vec2<f32>,
    @location(2) normal: vec3<f32>
) -> @location(0) vec4<f32> {
    // Calculate distance from center for circular shape
    let dist = length(texCoord * 2.0 - 1.0);
    if (dist > 1.0) {
        discard;
    }
    
    // Simple lighting
    let lightDir = normalize(vec3<f32>(0.0, 0.0, 1.0));
    let ambient = 0.2;
    let diffuse = max(dot(normal, lightDir), 0.0);
    let lighting = ambient + (1.0 - ambient) * diffuse;
    
    return vec4<f32>(color.rgb * lighting, color.a);
}