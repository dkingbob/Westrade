import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function initScene(canvas) {
  // ── Renderer ─────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  // ── Scene + Camera ────────────────────────────────────
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#080808')
  scene.fog = new THREE.FogExp2('#080808', 0.075)

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5.5)

  // ── 3D Object: faceted gem ────────────────────────────
  const geoMain = new THREE.IcosahedronGeometry(1.25, 1)
  const matMain = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0e0e0e'),
    metalness: 0.95,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 1,
  })
  const mesh = new THREE.Mesh(geoMain, matMain)
  scene.add(mesh)

  const geoWire = new THREE.IcosahedronGeometry(1.28, 1)
  const matWire = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FF4D00'),
    wireframe: true,
    transparent: true,
    opacity: 0.07,
  })
  const wireMesh = new THREE.Mesh(geoWire, matWire)
  scene.add(wireMesh)

  // ── Lights ─────────────────────────────────────────────
  scene.add(new THREE.AmbientLight('#ffffff', 0.4))

  const orangeLight = new THREE.PointLight('#FF6020', 120, 18)
  orangeLight.position.set(4, 3, 3)
  scene.add(orangeLight)

  const rimLight = new THREE.PointLight('#8888ff', 25, 12)
  rimLight.position.set(-3, -2, 2)
  scene.add(rimLight)

  const fillLight = new THREE.PointLight('#ffffff', 18, 10)
  fillLight.position.set(0, 4, 1)
  scene.add(fillLight)

  // ── Particles ──────────────────────────────────────────
  const count = 1000
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 22
  const particleGeo = new THREE.BufferGeometry()
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const particleMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.016, transparent: true, opacity: 0.3 })
  const particles = new THREE.Points(particleGeo, particleMat)
  scene.add(particles)

  // ── Scroll-driven state ────────────────────────────────
  const cam = { x: 0, y: 0, z: 5.5 }
  const obj = { rotY: 0, rotX: 0, scale: 1 }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.8,
    },
  })

  tl.to(cam, { x: 2.2, y: 0.4, z: 4.8, ease: 'none', duration: 1 }, 0)
    .to(obj, { rotY: Math.PI * 0.6, rotX: 0.2, ease: 'none', duration: 1 }, 0)
    .to(cam, { x: -2, y: -0.3, z: 4.5, ease: 'none', duration: 1 }, 1)
    .to(obj, { rotY: Math.PI * 1.2, rotX: -0.15, ease: 'none', duration: 1 }, 1)
    .to(cam, { x: 0.5, y: 1.2, z: 5, ease: 'none', duration: 1 }, 2)
    .to(obj, { rotY: Math.PI * 1.8, rotX: 0.3, ease: 'none', duration: 1 }, 2)
    .to(cam, { x: 0, y: 0, z: 4.8, ease: 'none', duration: 1 }, 3)
    .to(obj, { rotY: Math.PI * 2.2, rotX: 0, scale: 1.1, ease: 'none', duration: 1 }, 3)

  // ── Render loop ────────────────────────────────────────
  let idleT = 0
  let lastRaf = 0

  function animate(ts) {
    requestAnimationFrame(animate)
    const dt = Math.min((ts - lastRaf) / 1000, 0.05)
    lastRaf = ts
    idleT += dt

    camera.position.x += (cam.x - camera.position.x) * 0.05
    camera.position.y += (cam.y - camera.position.y) * 0.05
    camera.position.z += (cam.z - camera.position.z) * 0.05
    camera.lookAt(0, 0, 0)

    mesh.rotation.y = obj.rotY + idleT * 0.18
    mesh.rotation.x = obj.rotX + Math.sin(idleT * 0.4) * 0.06
    mesh.scale.setScalar(obj.scale + Math.sin(idleT * 0.5) * 0.015)
    wireMesh.rotation.copy(mesh.rotation)
    wireMesh.scale.copy(mesh.scale)

    orangeLight.position.x = Math.sin(idleT * 0.3) * 5
    orangeLight.position.z = Math.cos(idleT * 0.3) * 4

    particles.rotation.y = idleT * 0.018

    renderer.render(scene, camera)
  }
  requestAnimationFrame(animate)

  // ── Resize ─────────────────────────────────────────────
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  return () => {
    window.removeEventListener('resize', onResize)
    tl.kill()
    renderer.dispose()
  }
}
