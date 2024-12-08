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
    @location(2) normal: vec3<f32>,
    @location(3) viewPos: vec3<f32>
};

@vertex
fn vertexMain(
    @location(0) quadPos: vec2<f32>,
    @location(1) position: vec4<f32>,
    @location(2) velocity: vec4<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    let particleSize = 0.02;
    
    let worldPos = camera.model * vec4<f32>(position.xyz, 1.0);
    let viewPos = (camera.view * worldPos).xyz;
    
    let billboardPos = viewPos + vec3<f32>(quadPos.x, quadPos.y, 0.0) * particleSize;
    
    output.position = camera.projection * vec4<f32>(billboardPos, 1.0);
    output.viewPos = billboardPos;
    
    // Density-based coloring
    let normalizedDensity = position.w / 1000.0;
    let lowColor = vec3<f32>(0.0, 0.0, 1.0);
    let highColor = vec3<f32>(1.0, 0.0, 0.0);
    let color = mix(lowColor, highColor, normalizedDensity);
    output.color = vec4<f32>(color, 1.0);
    
    output.texCoord = quadPos * 0.5 + 0.5;
    
    // Calculate spherical normal
    let sphereNormal = normalize(vec3<f32>(quadPos.x, quadPos.y, 
        sqrt(max(1.0 - quadPos.x * quadPos.x - quadPos.y * quadPos.y, 0.0))));
    output.normal = sphereNormal;
    
    return output;
}

@fragment
fn fragmentMain(
    @location(0) color: vec4<f32>,
    @location(1) texCoord: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) viewPos: vec3<f32>
) -> @location(0) vec4<f32> {
    // Discard fragments outside circle
    let dist = length(texCoord * 2.0 - 1.0);
    if (dist > 1.0) {
        discard;
    }

    // Material properties
    let ambient = 0.5;
    let diffuseStrength = 0.6;
    let specularStrength = 0.4;
    let shininess = 32.0;
    
    // Light properties
    let lightPos = vec3<f32>(10.0, 10.0, 10.0);
    let lightColor = vec3<f32>(1.0, 1.0, 1.0);
    
    // Calculate lighting vectors
    let lightDir = normalize(lightPos - viewPos);
    let viewDir = normalize(-viewPos);
    let reflectDir = reflect(-lightDir, normal);
    
    // Ambient
    let ambientColor = ambient * lightColor;
    
    // Diffuse
    let diffuseFactor = max(dot(normal, lightDir), 0.0);
    let diffuseColor = diffuseStrength * diffuseFactor * lightColor;
    
    // Specular
    let specularFactor = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
    let specularColor = specularStrength * specularFactor * lightColor;
    
    // Combine lighting
    let finalColor = (ambientColor + diffuseColor + specularColor) * color.rgb;
    
    return vec4<f32>(finalColor, color.a);
}