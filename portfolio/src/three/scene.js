import * as THREE from 'three'

export function createScene(container) {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setClearColor(0x000005, 1)
  container.appendChild(renderer.domElement)

  // Scene & Camera
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    2000
  )
  camera.position.set(0, 0, 80)

  // Fog
  scene.fog = new THREE.FogExp2(0x000005, 0.008)

  // ── Particle field ──────────────────────────────────────────────
  const particleCount = 1800
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const palette = [
    new THREE.Color(0x00ffff),
    new THREE.Color(0x00ff88),
    new THREE.Color(0xff3366),
    new THREE.Color(0x8844ff),
  ]
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 400
    positions[i * 3 + 1] = (Math.random() - 0.5) * 400
    positions[i * 3 + 2] = (Math.random() - 0.5) * 400
    const c = palette[Math.floor(Math.random() * palette.length)]
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const pMat = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
  })
  const particles = new THREE.Points(pGeo, pMat)
  scene.add(particles)

  // ── Wireframe torus knot ─────────────────────────────────────────
  const torusGeo = new THREE.TorusKnotGeometry(18, 5, 140, 18, 2, 3)
  const torusMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    wireframe: true,
    transparent: true,
    opacity: 0.12,
  })
  const torus = new THREE.Mesh(torusGeo, torusMat)
  torus.position.set(45, -10, -40)
  scene.add(torus)

  // ── Wireframe icosahedron ────────────────────────────────────────
  const icoGeo = new THREE.IcosahedronGeometry(12, 2)
  const icoMat = new THREE.MeshBasicMaterial({
    color: 0x8844ff,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  })
  const ico = new THREE.Mesh(icoGeo, icoMat)
  ico.position.set(-50, 15, -30)
  scene.add(ico)

  // ── Wireframe octahedron ─────────────────────────────────────────
  const octGeo = new THREE.OctahedronGeometry(9, 2)
  const octMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    wireframe: true,
    transparent: true,
    opacity: 0.13,
  })
  const oct = new THREE.Mesh(octGeo, octMat)
  oct.position.set(10, 30, -60)
  scene.add(oct)

  // ── Neon grid plane ──────────────────────────────────────────────
  const gridHelper = new THREE.GridHelper(200, 30, 0x00ffff, 0x003344)
  gridHelper.material.transparent = true
  gridHelper.material.opacity = 0.12
  gridHelper.position.y = -50
  scene.add(gridHelper)

  // ── Floating line segments ───────────────────────────────────────
  const lineGroup = new THREE.Group()
  const lineMats = [
    new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 }),
    new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.25 }),
    new THREE.LineBasicMaterial({ color: 0x8844ff, transparent: true, opacity: 0.2 }),
  ]
  for (let i = 0; i < 20; i++) {
    const pts = []
    const ox = (Math.random() - 0.5) * 200
    const oy = (Math.random() - 0.5) * 200
    const oz = (Math.random() - 0.5) * 100
    for (let j = 0; j < 5; j++) {
      pts.push(
        new THREE.Vector3(
          ox + (Math.random() - 0.5) * 30,
          oy + (Math.random() - 0.5) * 30,
          oz + (Math.random() - 0.5) * 10
        )
      )
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = lineMats[i % lineMats.length]
    lineGroup.add(new THREE.Line(geo, mat))
  }
  scene.add(lineGroup)

  // ── Mouse parallax ───────────────────────────────────────────────
  let mouseX = 0
  let mouseY = 0
  const onMouseMove = (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2
  }
  window.addEventListener('mousemove', onMouseMove)

  // ── Resize handler ───────────────────────────────────────────────
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  // ── Animation loop ───────────────────────────────────────────────
  let frameId
  const clock = new THREE.Clock()

  const animate = () => {
    frameId = requestAnimationFrame(animate)
    const t = clock.getElapsedTime()

    // Rotate shapes
    torus.rotation.x = t * 0.08
    torus.rotation.y = t * 0.12
    ico.rotation.x = t * 0.1
    ico.rotation.y = -t * 0.07
    oct.rotation.z = t * 0.09
    oct.rotation.x = t * 0.06

    // Drift particles
    particles.rotation.y = t * 0.01
    particles.rotation.x = t * 0.005

    // Scroll-drift grid
    gridHelper.position.z = (t * 4) % 40

    // Mouse parallax camera
    camera.position.x += (mouseX * 8 - camera.position.x) * 0.03
    camera.position.y += (-mouseY * 5 - camera.position.y) * 0.03
    camera.lookAt(scene.position)

    // Pulse particle opacity
    pMat.opacity = 0.55 + Math.sin(t * 0.8) * 0.15

    renderer.render(scene, camera)
  }
  animate()

  // ── Cleanup ──────────────────────────────────────────────────────
  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', onResize)
    renderer.dispose()
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement)
    }
  }
}
