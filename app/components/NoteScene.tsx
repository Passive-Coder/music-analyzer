"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const DESCRIPTION =
  "A centered metallic light purple 3D music note tilted 15 degrees clockwise on a very dark purple background with subtle moving light purple accents.";
const LIGHT_MOTION_MULTIPLIER = 1.5;
const POINTER_TILT_LIMIT = THREE.MathUtils.degToRad(5);

export function NoteScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    container.dataset.sceneStatus = "initializing";

    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.88;
      renderer.shadowMap.enabled = false;
      renderer.domElement.className = "scene-canvas";
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", DESCRIPTION);
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.set(0, 0, 15.5);

      const glowTexture = createGlowTexture();
      const environmentRig = createEnvironmentRig(renderer);
      scene.environment = environmentRig.renderTarget.texture;

      const hemiLight = new THREE.HemisphereLight(0xcdbfff, 0x08040f, 0.18);
      scene.add(hemiLight);

      const keyLight = new THREE.SpotLight(
        0xe2d1ff,
        16,
        42,
        Math.PI / 5,
        0.38,
        1.7
      );
      keyLight.position.set(4.2, 5.6, 10.1);
      scene.add(keyLight);
      scene.add(keyLight.target);

      const fillLight = new THREE.PointLight(0x8a62ff, 4.8, 0, 2);
      fillLight.position.set(-5.8, 1.8, 7.2);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(0x4d2ca0, 3.8, 0, 2);
      rimLight.position.set(5.1, -1.8, 5.8);
      scene.add(rimLight);

      const frontLight = new THREE.DirectionalLight(0xd9c4ff, 0.85);
      frontLight.position.set(-1.2, 1.1, 8.4);
      scene.add(frontLight);

      const glowBodies = createGlowBodies(glowTexture);
      glowBodies.forEach((body) => {
        scene.add(body.sprite);
        environmentRig.scene.add(body.envOrb);
      });

      const noteMaterial = createNoteMaterial();
      const note = createNote(noteMaterial);
      scene.add(note);

      const pointer = { x: 0, y: 0 };

      const handlePointerMove = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();

        if (!rect.width || !rect.height) {
          return;
        }

        const x = THREE.MathUtils.clamp(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -1,
          1
        );
        const y = THREE.MathUtils.clamp(
          ((event.clientY - rect.top) / rect.height) * 2 - 1,
          -1,
          1
        );

        pointer.x = x;
        pointer.y = y;
      };

      const handlePointerLeave = () => {
        pointer.x = 0;
        pointer.y = 0;
      };

      container.addEventListener("pointermove", handlePointerMove);
      container.addEventListener("pointerleave", handlePointerLeave);

      const resize = () => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      resize();
      window.addEventListener("resize", resize);
      container.dataset.sceneStatus = "ready";

      const clock = new THREE.Clock();
      let environmentFrame = 0;

      renderer.setAnimationLoop(() => {
        const delta = Math.min(clock.getDelta(), 0.033);
        const pointerLength = Math.hypot(pointer.x, pointer.y);
        const pointerScale = pointerLength > 1 ? 1 / pointerLength : 1;

        note.rotation.x = -pointer.y * pointerScale * POINTER_TILT_LIMIT;
        note.rotation.y = pointer.x * pointerScale * POINTER_TILT_LIMIT;

        updateGlowBodies(glowBodies, delta * LIGHT_MOTION_MULTIPLIER);
        keyLight.target.position.x =
          Math.sin(clock.elapsedTime * 0.2 * LIGHT_MOTION_MULTIPLIER) * 0.14;

        environmentFrame += 1;
        if (environmentFrame % 6 === 0) {
          environmentRig.renderTarget.dispose();
          environmentRig.renderTarget = environmentRig.pmremGenerator.fromScene(
            environmentRig.scene,
            0.035
          );
          scene.environment = environmentRig.renderTarget.texture;
        }

        renderer.render(scene, camera);
      });

      return () => {
        container.dataset.sceneStatus = "disposed";
        renderer.setAnimationLoop(null);
        window.removeEventListener("resize", resize);
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerleave", handlePointerLeave);

        glowBodies.forEach((body) => {
          scene.remove(body.sprite);
          environmentRig.scene.remove(body.envOrb);
          disposeMaterial(body.sprite.material);
          body.envOrb.geometry.dispose();
          disposeMaterial(body.envOrb.material);
        });

        note.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });

        scene.remove(note);
        scene.remove(hemiLight);
        scene.remove(keyLight);
        scene.remove(keyLight.target);
        scene.remove(fillLight);
        scene.remove(rimLight);
        scene.remove(frontLight);

        noteMaterial.dispose();
        glowTexture.dispose();
        environmentRig.renderTarget.dispose();
        environmentRig.pmremGenerator.dispose();
        renderer.dispose();

        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown scene error";
      container.dataset.sceneStatus = "error";
      container.dataset.sceneError = message;
      console.error(error);
      return undefined;
    }
  }, []);

  return (
    <section className="scene-shell">
      <h1 className="sr-only">3D Metallic Musical Note</h1>
      <div ref={containerRef} className="scene-viewport" />
    </section>
  );
}

function createNoteMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc5b1ef,
    metalness: 1,
    roughness: 0.12,
    envMapIntensity: 2.6,
    clearcoat: 0.38,
    clearcoatRoughness: 0.06,
  });
}

function createNote(material: THREE.MeshPhysicalMaterial) {
  const noteGroup = new THREE.Group();

  const beam = new THREE.Mesh(
    createExtrudedShape(createRoundedRectShape(5, 0.82, 0.08), {
      depth: 0.72,
      bevelSize: 0.08,
      bevelThickness: 0.14,
      bevelSegments: 10,
      curveSegments: 28,
    }),
    material
  );
  beam.position.set(0, 2.74, 0);
  noteGroup.add(beam);

  const leftStem = new THREE.Mesh(
    createExtrudedShape(createRoundedRectShape(0.6, 4.46, 0.05), {
      depth: 0.72,
      bevelSize: 0.07,
      bevelThickness: 0.13,
      bevelSegments: 10,
      curveSegments: 24,
    }),
    material
  );
  leftStem.position.set(-2.2, 0.38, 0);
  noteGroup.add(leftStem);

  const rightStem = new THREE.Mesh(
    createExtrudedShape(createRoundedRectShape(0.6, 4.38, 0.05), {
      depth: 0.72,
      bevelSize: 0.07,
      bevelThickness: 0.13,
      bevelSegments: 10,
      curveSegments: 24,
    }),
    material
  );
  rightStem.position.set(2.18, 0.32, 0);
  rightStem.scale.x = -1;
  noteGroup.add(rightStem);

  const head = new THREE.Mesh(
    createExtrudedShape(createEllipseShape(0.92, 0.8), {
      depth: 0.8,
      bevelSize: 0.14,
      bevelThickness: 0.16,
      bevelSegments: 14,
      curveSegments: 48,
    }),
    material
  );
  head.position.set(-2.9, -1.75, 0);
  noteGroup.add(head);

  const rightHead = new THREE.Mesh(
    createExtrudedShape(createEllipseShape(0.92, 0.8), {
      depth: 0.8,
      bevelSize: 0.14,
      bevelThickness: 0.16,
      bevelSegments: 14,
      curveSegments: 48,
    }),
    material
  );
  rightHead.position.set(1.5, -1.75, 0);
  noteGroup.add(rightHead);

  const bounds = new THREE.Box3().setFromObject(noteGroup);
  const center = bounds.getCenter(new THREE.Vector3());
  noteGroup.position.sub(center);
  noteGroup.scale.setScalar(0.8);
  noteGroup.rotation.z = -Math.PI / 12;

  return noteGroup;
}

function createEnvironmentRig(renderer: THREE.WebGLRenderer) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const environmentScene = new THREE.Scene();
  environmentScene.background = new THREE.Color(0x04020a);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(24, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x090411, side: THREE.BackSide })
  );
  environmentScene.add(shell);

  environmentScene.add(new THREE.AmbientLight(0x261238, 0.16));

  const key = new THREE.PointLight(0xf5eeff, 9, 0, 2);
  key.position.set(5.8, 3.6, 7.6);
  environmentScene.add(key);

  const violet = new THREE.PointLight(0x9d7aff, 6.2, 0, 2);
  violet.position.set(-6.4, 2.2, 5.8);
  environmentScene.add(violet);

  const back = new THREE.PointLight(0x3b1d5b, 4.6, 0, 2);
  back.position.set(0, -6, -8);
  environmentScene.add(back);

  return {
    pmremGenerator,
    scene: environmentScene,
    renderTarget: pmremGenerator.fromScene(environmentScene, 0.035),
  };
}

function createEnvOrb(
  color: THREE.ColorRepresentation,
  position: [number, number, number],
  radius: number
) {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  orb.position.set(position[0], position[1], position[2]);
  return orb;
}

function createGlowBodies(texture: THREE.Texture) {
  return [
    createGlowBody(texture, {
      color: 0x9a74ff,
      opacity: 0.11,
      scale: 8.4,
      position: [-4.6, 2.4, -5.1],
      envRadius: 1.4,
      velocity: [0.28, 0.19, 0.08],
      bounds: [5.4, 3.3, 1.4],
    }),
    createGlowBody(texture, {
      color: 0x7440d6,
      opacity: 0.14,
      scale: 6.8,
      position: [4.9, -2.1, -5.4],
      envRadius: 1.15,
      velocity: [-0.24, 0.26, -0.06],
      bounds: [5.8, 3.5, 1.6],
    }),
    createGlowBody(texture, {
      color: 0xc9b1ff,
      opacity: 0.07,
      scale: 9.8,
      position: [0.2, 0.6, -5.8],
      envRadius: 1.7,
      velocity: [0.18, -0.22, 0.05],
      bounds: [4.8, 3.9, 1.2],
    }),
  ];
}

function createGlowBody(
  texture: THREE.Texture,
  config: {
    color: THREE.ColorRepresentation;
    opacity: number;
    scale: number;
    position: [number, number, number];
    envRadius: number;
    velocity: [number, number, number];
    bounds: [number, number, number];
  }
) {
  return {
    sprite: createGlow(
      texture,
      config.color,
      config.opacity,
      config.position,
      config.scale
    ),
    envOrb: createEnvOrb(config.color, config.position, config.envRadius),
    velocity: new THREE.Vector3(
      config.velocity[0],
      config.velocity[1],
      config.velocity[2]
    ),
    bounds: new THREE.Vector3(
      config.bounds[0],
      config.bounds[1],
      config.bounds[2]
    ),
  };
}

function updateGlowBodies(
  glowBodies: Array<{
    sprite: THREE.Sprite;
    envOrb: THREE.Mesh;
    velocity: THREE.Vector3;
    bounds: THREE.Vector3;
  }>,
  delta: number
) {
  glowBodies.forEach((body) => {
    body.sprite.position.addScaledVector(body.velocity, delta);
    body.envOrb.position.copy(body.sprite.position);
    body.envOrb.position.z = Math.max(body.sprite.position.z + 10.5, 2.6);

    if (Math.abs(body.sprite.position.x) > body.bounds.x) {
      body.velocity.x *= -1;
      body.sprite.position.x = THREE.MathUtils.clamp(
        body.sprite.position.x,
        -body.bounds.x,
        body.bounds.x
      );
    }

    if (Math.abs(body.sprite.position.y) > body.bounds.y) {
      body.velocity.y *= -1;
      body.sprite.position.y = THREE.MathUtils.clamp(
        body.sprite.position.y,
        -body.bounds.y,
        body.bounds.y
      );
    }

    if (Math.abs(body.envOrb.position.z - 4.6) > body.bounds.z) {
      body.velocity.z *= -1;
    }
  });
}

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create glow texture.");
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.4)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createGlow(
  texture: THREE.Texture,
  color: THREE.ColorRepresentation,
  opacity: number,
  position: [number, number, number],
  scale: number
) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );

  sprite.position.set(position[0], position[1], position[2]);
  sprite.scale.set(scale, scale, 1);

  return sprite;
}

function createEllipseShape(radiusX: number, radiusY: number) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, radiusX, radiusY, 0, Math.PI * 2, false, 0);
  return shape;
}

function createRoundedRectShape(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();

  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  return shape;
}

function createExtrudedShape(
  shape: THREE.Shape,
  options: {
    depth: number;
    bevelSize: number;
    bevelThickness: number;
    bevelSegments: number;
    curveSegments: number;
  }
) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: options.depth,
    bevelEnabled: true,
    bevelSize: options.bevelSize,
    bevelThickness: options.bevelThickness,
    bevelSegments: options.bevelSegments,
    steps: 1,
    curveSegments: options.curveSegments,
  });

  geometry.center();
  geometry.computeVertexNormals();

  return geometry;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}
