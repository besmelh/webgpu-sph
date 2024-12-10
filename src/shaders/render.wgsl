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
    
    // Increase particle size for more overlap
    let particleSize = 0.2;  // Increased from 0.15
    
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
    // Calculate radial distance from center of quad
    let distFromCenter = length(input.quadPos);
    
    // Use gaussian-like falloff for smoother blending
    let falloff = exp(-distFromCenter * distFromCenter * 2.0);
    
    // Discard pixels too far from center
    if (falloff < 0.8) {
        discard;
    }
    
    // Calculate lighting
    let normal = normalize(vec3<f32>(input.quadPos.x, input.quadPos.y, 
        sqrt(max(1.0 - input.quadPos.x * input.quadPos.x - input.quadPos.y * input.quadPos.y, 0.0))));
    
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.0);
    let ambient = 0.2;
    let lighting = ambient + diffuse * 0.8;
    
    // Create smooth falloff for blending
    let alpha = falloff * 0.5;  // Reduced alpha for better additive blending
    
    return vec4<f32>(input.color.rgb * lighting, alpha);
}