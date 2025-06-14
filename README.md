# Tessellarity

[![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-blue.svg)](https://webgpu.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-purple.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**An enhanced, production-ready branch of WebGPU-Ocean featuring modular architecture, comprehensive documentation, and advanced developer tools for real-time fluid dynamics simulation.**

Built upon the exceptional foundation of [matsuoka-601's WebGPU-Ocean](https://github.com/matsuoka-601/WebGPU-Ocean), Tessellarity transforms the original technical demonstration into a comprehensive learning and development platform while preserving 100% of the core simulation algorithms.

![Tessellarity Demo](https://github.com/user-attachments/assets/5b008b16-7d46-4e09-af21-d70f6fa2ec20)

## ✨ What Makes Tessellarity Different

### 🏗️ **Modular Architecture**
- **Plugin System**: `SimulatorRegistry` for dynamically adding new simulation types
- **Type-Safe Configuration**: `SimulatorConfig` system replacing hard-coded values
- **Centralized UI Management**: `UIManager` for consistent interface updates
- **Clean Separation**: `ApplicationManager` orchestrating all subsystems

### 📚 **Comprehensive Documentation**
- **[Core Architecture Whitepaper](docs/CORE_ARCHITECTURE_WHITEPAPER.md)**: Deep technical analysis
- **[API Reference](docs/API_REFERENCE.md)**: Complete interface documentation
- **[Contributing Guide](docs/CONTRIBUTING.md)**: Professional development workflow
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)**: Production deployment procedures

### 🎨 **Enhanced User Experience**
- **Advanced Fluid Controls**: Color picker, transparency, reflectivity, wave height, viscosity
- **Multiple Environments**: Industrial Sunset, Venice Sunset, Forest, White backgrounds
- **Real-Time Parameter Adjustment**: Live tweaking without restart
- **Professional UI**: Clean, modern interface design

### ⚗️ **Extended Simulation Features**
- **Original MLS-MPM & SPH**: All original algorithms preserved and optimized
- **Boids Flocking Simulation**: Complete emergent swarm behavior system
- **Enhanced Rendering**: Advanced specular reflection and lighting improvements
- **Performance Monitoring**: Real-time performance metrics and debugging

### 🔧 **Developer Tools**
- **Example Templates**: Complete `example-new-simulator/` showing how to extend
- **Error Handling**: `ShaderErrorReporter` and `ErrorStreamingService`
- **Debug System**: Comprehensive debugging and introspection tools
- **Hot Reload**: Vite-powered development with instant updates

## 🚀 Quick Start

### Prerequisites
- Browser with [WebGPU support](https://webgpu.io/) (Chrome 113+, Firefox Nightly, Safari Technology Preview)
- Node.js 18+ and npm

### Installation & Running
```bash
# Clone the repository
git clone https://github.com/cybrdelic/tessellarity.git
cd tessellarity

# Install dependencies
npm install

# Start development server
npm run serve
```

Visit `http://localhost:5173` to see the simulation in action!

### Building for Production
```bash
npm run build
```

## 🌊 Simulation Technologies

### **Moving Least Squares Material Point Method (MLS-MPM)**
- **Performance**: 100,000+ particles on integrated graphics, 300,000+ on discrete GPUs
- **Algorithm**: Based on [Hu et al.'s SIGGRAPH 2018 paper](https://yzhu.io/publication/mpmmls2018siggraph/paper.pdf)
- **Implementation**: WebGPU compute shaders with atomicAdd and fixed-point arithmetic
- **Advantages**: No neighborhood search required, highly parallelizable

### **Smoothed Particle Hydrodynamics (SPH)**
- **Foundation**: [Müller et al.'s particle-based fluid simulation](https://matthias-research.github.io/pages/publications/sca03.pdf)
- **Optimization**: Fast fixed-radius nearest neighbor search on GPU
- **Features**: Classical fluid behavior with surface tension effects

### **Boids Flocking Simulation**
- **Purpose**: Educational comparison and swarm behavior demonstration
- **Features**: Separation, alignment, cohesion behaviors
- **Implementation**: GPU-accelerated with spatial partitioning

### **Screen-Space Fluid Rendering**
- **Technique**: Based on [NVIDIA's GDC 2010 presentation](https://developer.download.nvidia.com/presentations/2010/gdc/Direct3D_Effects.pdf)
- **Features**: Real-time depth-based rendering with bilateral filtering
- **Enhancements**: Custom lighting models and environment reflections

## 📁 Project Structure

```
tessellarity/
├── src/core/              # Core architecture components
├── mls-mpm/              # MLS-MPM simulation implementation
├── sph/                  # SPH simulation implementation
├── boids/                # Boids flocking simulation
├── render/               # Rendering pipeline and shaders
├── docs/                 # Comprehensive documentation
├── example-new-simulator/ # Templates for extending the system
└── types/                # TypeScript type definitions
```

## 🎮 Controls & Features

### **Simulation Modes**
- **MLS-MPM**: High-performance material point method
- **SPH**: Classical smoothed particle hydrodynamics
- **Boids**: Emergent flocking behavior simulation

### **Visual Controls**
- **Fluid Appearance**: Color, transparency, reflectivity, wave height
- **Environment**: Multiple HDR environment maps
- **Camera**: Free-look camera with mouse/touch controls
- **Parameters**: Real-time adjustment of simulation parameters

### **Developer Features**
- **Performance Metrics**: FPS, particle count, GPU utilization
- **Debug Modes**: Wireframe, particle visualization, grid overlay
- **Error Reporting**: Detailed shader compilation and runtime errors
- **Export Tools**: Configuration export/import functionality

## 📖 Documentation

- **[System Overview](docs/OVERVIEW.md)**: High-level architecture and design philosophy
- **[Core Architecture](docs/CORE_ARCHITECTURE_WHITEPAPER.md)**: Detailed technical specification
- **[API Reference](docs/API_REFERENCE.md)**: Complete API documentation
- **[Simulator Implementation Guide](docs/SIMULATOR_IMPLEMENTATIONS_REFERENCE.md)**: How to add new simulators
- **[Contributing Guidelines](docs/CONTRIBUTING.md)**: Development workflow and standards
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)**: Production deployment procedures

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for:
- Development setup and workflow
- Code style and standards
- How to add new simulation types
- Testing and debugging procedures
- Pull request guidelines

## 🙏 Attribution

This project builds upon the exceptional work of:
- **[matsuoka-601](https://github.com/matsuoka-601)**: Original WebGPU-Ocean implementation
- **[nialltl](https://nialltl.neocities.org/)**: MLS-MPM implementation guidance
- **WebGPU Community**: Technical resources and examples

See [ATTRIBUTION_AND_CONTRIBUTIONS.md](docs/ATTRIBUTION_AND_CONTRIBUTIONS.md) for complete credits.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- SPH mode may crash on macOS with certain GPU configurations
- Large particle counts (>500k) may cause performance issues on integrated graphics
- Some environment maps may not load properly on older browsers

For bug reports and feature requests, please use [GitHub Issues](https://github.com/cybrdelic/tessellarity/issues).

---

**Built with ❤️ for the WebGPU and fluid simulation communities**
