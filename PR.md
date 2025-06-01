# Add Water Appearance Customization

## Changes
- Added UI controls for water appearance customization
- Implemented water color, transparency, reflectivity, wave height, and viscosity controls
- Removed hardcoded blue color values from shaders
- Added uniform buffer for water appearance properties

## Files Changed

### index.html
- Added appearance controls div with color picker and sliders
- Added viscosity slider control
- Added CSS styling for new UI controls

### common.ts
- Added new uniform buffer structure for water appearance
- Added waterAppearanceValues and waterAppearanceViews
- Added viscosity parameter to water appearance buffer

### main.ts
- Added event listeners for water appearance controls
- Added waterAppearanceBuffer creation and binding
- Added buffer updates for color, transparency, reflectivity, wave height, and viscosity

### fluid.wgsl
- Added WaterAppearance uniform struct
- Added viscosity parameter
- Removed hardcoded blue color values
- Modified shader to use water appearance uniforms
- Updated color calculations to properly blend water properties

## Testing
1. Open the application
2. Use color picker to change water color
3. Adjust transparency slider (0-100%)
4. Adjust reflectivity slider (0-100%)
5. Adjust wave height slider (0-100%)
6. Adjust viscosity slider (0-100%)
7. Verify changes apply in real-time
8. Verify no hardcoded blue tint remains

## Performance Impact
- Minimal impact: Added one small uniform buffer
- No additional texture samples or complex calculations
- UI controls only update on user interaction

## Future Improvements
- Add presets for common water types (ocean, lake, pool)
- Add normal map intensity control
- Add caustics intensity control
- Save user preferences locally
