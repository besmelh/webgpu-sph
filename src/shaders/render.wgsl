struct Camera {
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>
};

@binding(0) @group(0) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) viewPos: vec3<f32>,
    @location(2) density: f32,
    @location(3) rayDir: vec3<f32>
};

@vertex
fn vertexMain(
    @location(0) quadPos: vec2<f32>,
    @location(1) position: vec4<f32>,
    @location(2) velocity: vec4<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    let particleSize = 0.03;
    
    let worldPos = camera.model * vec4<f32>(position.xyz, 1.0);
    let viewPos = (camera.view * worldPos).xyz;
    
    let billboardPos = viewPos + vec3<f32>(quadPos.x, quadPos.y, 0.0) * particleSize;
    
    output.position = camera.projection * vec4<f32>(billboardPos, 1.0);
    output.viewPos = billboardPos;
    output.worldPos = worldPos.xyz;
    output.density = position.w;
    
    // Calculate ray direction for ray marching
    let camPos = vec3<f32>(0.0, 0.0, 5.0); // Camera position in view space
    output.rayDir = normalize(billboardPos - camPos);
    
    return output;
}

// Metaball field calculation
fn calculateField(pos: vec3<f32>, particlePos: vec3<f32>, radius: f32) -> f32 {
    let dist = length(pos - particlePos);
    return radius * radius / (dist * dist);
}

@fragment
fn fragmentMain(
    @location(0) worldPos: vec3<f32>,
    @location(1) viewPos: vec3<f32>,
    @location(2) density: f32,
    @location(3) rayDir: vec3<f32>
) -> @location(0) vec4<f32> {
    let MAX_STEPS = 64;
    let STEP_SIZE = 0.05;
    let THRESHOLD = 1.0;

    var pos = viewPos;
    var totalDensity = 0.0;

       // Ray marching loop
    for(var i = 0; i < MAX_STEPS; i++) {
        // Calculate metaball field at current position
        let field = calculateField(pos, viewPos, 0.1);
        totalDensity += field;
        
        // If we're inside the metaball surface
        if(totalDensity > THRESHOLD) {
            // Calculate normal for lighting
            let epsilon = vec3<f32>(0.01, 0.0, 0.0);
            let nx = calculateField(pos + epsilon.xyy, viewPos, 0.1) - 
                    calculateField(pos - epsilon.xyy, viewPos, 0.1);
            let ny = calculateField(pos + epsilon.yxy, viewPos, 0.1) - 
                    calculateField(pos - epsilon.yxy, viewPos, 0.1);
            let nz = calculateField(pos + epsilon.yyx, viewPos, 0.1) - 
                    calculateField(pos - epsilon.yyx, viewPos, 0.1);
            let normal = normalize(vec3<f32>(nx, ny, nz));
            
            // Basic lighting
            let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
            let diffuse = max(dot(normal, lightDir), 0.0);
            let ambient = 0.2;
            
            // Color based on density
            let baseColor = mix(
                vec3<f32>(0.0, 0.0, 1.0), // Blue
                vec3<f32>(1.0, 0.0, 0.0), // Red
                min(density / 1000.0, 1.0)
            );
            
            let finalColor = baseColor * (ambient + diffuse);
            return vec4<f32>(finalColor, 1.0);
        }
        
        pos += rayDir * STEP_SIZE;
    }
    
    // Discard if we didn't hit anything
    discard;
    return vec4<f32>(0.0);
}