"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const DESCRIPTION =
  "A centered metallic light purple 3D music note tilted 15 degrees clockwise on a very dark purple background with subtle moving light purple accents.";
const LIGHT_MOTION_MULTIPLIER = 1.5;
const POINTER_TILT_LIMIT = THREE.MathUtils.degToRad(5);
const BASE_NOTE_TILT = -Math.PI / 12;
const LOGO_MODE_SCALE = 0.28;
const LOGO_TRANSITION_DURATION = 1.25;
const FULL_ROTATION = Math.PI * 2;
const HOME_NOTE_COLOR = new THREE.Color(0xc5b1ef);
const LOGO_NOTE_COLOR = new THREE.Color(0xd9c4ff);
const HOME_NOTE_EMISSIVE = new THREE.Color(0x12081a);
const LOGO_NOTE_EMISSIVE = new THREE.Color(0x62489a);
const LOGO_CLICK_TARGET_SIZE = new THREE.Vector3(8.8, 9.6, 4.4);

type NoteSceneProps = {
  isLogoMode?: boolean;
  isPromoted?: boolean;
  onNoteClick?: () => void;
  onTransitionComplete?: (mode: "home" | "logo") => void;
};

export function NoteScene({
  isLogoMode = false,
  isPromoted = false,
  onNoteClick,
  onTransitionComplete,
}: NoteSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLogoModeRef = useRef(isLogoMode);
  const onNoteClickRef = useRef(onNoteClick);
  const onTransitionCompleteRef = useRef(onTransitionComplete);

  useEffect(() => {
    isLogoModeRef.current = isLogoMode;
  }, [isLogoMode]);

  useEffect(() => {
    onNoteClickRef.current = onNoteClick;
  }, [onNoteClick]);

  useEffect(() => {
    onTransitionCompleteRef.current = onTransitionComplete;
  }, [onTransitionComplete]);

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
      const noteRig = new THREE.Group();
      const note = createNote(noteMaterial);
      note.rotation.z = BASE_NOTE_TILT;
      noteRig.add(note);

      const noteClickTarget = new THREE.Mesh(
        new THREE.BoxGeometry(
          LOGO_CLICK_TARGET_SIZE.x,
          LOGO_CLICK_TARGET_SIZE.y,
          LOGO_CLICK_TARGET_SIZE.z
        ),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      noteRig.add(noteClickTarget);
      scene.add(noteRig);

      const restPosition = new THREE.Vector3();
      const logoTargetPosition = new THREE.Vector3();
      const raycaster = new THREE.Raycaster();
      const raycastPointer = new THREE.Vector2();
      const noteMeshes: THREE.Object3D[] = [noteClickTarget];

      note.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          noteMeshes.push(child);
        }
      });

      const pointer = { x: 0, y: 0 };
      let transitionProgress = isLogoModeRef.current ? 1 : 0;
      let transitionStartProgress = transitionProgress;
      let transitionEndProgress = transitionProgress;
      let transitionElapsed = 0;
      let isTransitioning = false;
      let activeTarget = transitionEndProgress;
      let pendingCompletionTarget: number | null = null;

      const beginTransition = (target: number) => {
        activeTarget = target;
        transitionStartProgress = transitionProgress;
        transitionEndProgress = target;
        transitionElapsed = 0;
        isTransitioning = true;
        pendingCompletionTarget = target;
      };

      const isNoteClickable = () =>
        activeTarget === 1 && !isTransitioning && transitionProgress >= 0.999;

      const syncRaycastPointer = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();

        if (!rect.width || !rect.height) {
          return false;
        }

        raycastPointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        return true;
      };

      const isPointerOverNote = (event: PointerEvent) => {
        if (!syncRaycastPointer(event)) {
          return false;
        }

        raycaster.setFromCamera(raycastPointer, camera);

        return raycaster.intersectObjects(noteMeshes, false).length > 0;
      };

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

        container.style.cursor =
          isNoteClickable() && isPointerOverNote(event) ? "pointer" : "default";
      };

      const handlePointerLeave = () => {
        pointer.x = 0;
        pointer.y = 0;
        container.style.cursor = "default";
      };

      const handleClick = (event: PointerEvent) => {
        if (!isNoteClickable()) {
          return;
        }

        if (isPointerOverNote(event)) {
          onNoteClickRef.current?.();
        }
      };

      container.addEventListener("pointermove", handlePointerMove);
      container.addEventListener("pointerleave", handlePointerLeave);
      container.addEventListener("click", handleClick);

      const resize = () => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        renderer.setSize(width, height, false);
        logoTargetPosition.copy(
          screenToWorldOnPlane(
            camera,
            width - Math.min(width * 0.08, 96),
            Math.max(height * 0.11, 72),
            width,
            height,
            0
          )
        );
      };

      resize();
      window.addEventListener("resize", resize);
      container.dataset.sceneStatus = "ready";

      const clock = new THREE.Clock();
      let environmentFrame = 0;

      renderer.setAnimationLoop(() => {
        const delta = Math.min(clock.getDelta(), 0.033);
        const logoTarget = isLogoModeRef.current ? 1 : 0;

        if (logoTarget !== activeTarget) {
          beginTransition(logoTarget);
        }

        if (isTransitioning) {
          transitionElapsed = Math.min(
            transitionElapsed + delta,
            LOGO_TRANSITION_DURATION
          );

          const animationProgress = THREE.MathUtils.smootherstep(
            transitionElapsed / LOGO_TRANSITION_DURATION,
            0,
            1
          );

          transitionProgress = THREE.MathUtils.lerp(
            transitionStartProgress,
            transitionEndProgress,
            animationProgress
          );

          if (transitionElapsed >= LOGO_TRANSITION_DURATION) {
            transitionProgress = transitionEndProgress;
            isTransitioning = false;

            if (pendingCompletionTarget !== null) {
              onTransitionCompleteRef.current?.(
                pendingCompletionTarget === 1 ? "logo" : "home"
              );
              pendingCompletionTarget = null;
            }
          }
        } else {
          transitionProgress = activeTarget;
        }

        const easedLogoProgress = transitionProgress;
        const pointerLength = Math.hypot(pointer.x, pointer.y);
        const pointerScale = pointerLength > 1 ? 1 / pointerLength : 1;
        const pointerInfluence = 1 - easedLogoProgress;

        note.rotation.x =
          -pointer.y * pointerScale * POINTER_TILT_LIMIT * pointerInfluence;
        note.rotation.y =
          pointer.x * pointerScale * POINTER_TILT_LIMIT * pointerInfluence +
          easedLogoProgress * FULL_ROTATION;
        note.rotation.z = THREE.MathUtils.lerp(
          BASE_NOTE_TILT,
          0,
          easedLogoProgress
        );
        noteMaterial.color.lerpColors(
          HOME_NOTE_COLOR,
          LOGO_NOTE_COLOR,
          easedLogoProgress
        );
        noteMaterial.emissive.lerpColors(
          HOME_NOTE_EMISSIVE,
          LOGO_NOTE_EMISSIVE,
          easedLogoProgress
        );
        noteMaterial.metalness = THREE.MathUtils.lerp(1, 0.08, easedLogoProgress);
        noteMaterial.roughness = THREE.MathUtils.lerp(
          0.12,
          0.58,
          easedLogoProgress
        );
        noteMaterial.envMapIntensity = THREE.MathUtils.lerp(
          2.6,
          0.18,
          easedLogoProgress
        );
        noteMaterial.clearcoat = THREE.MathUtils.lerp(0.38, 0.04, easedLogoProgress);
        noteMaterial.clearcoatRoughness = THREE.MathUtils.lerp(
          0.06,
          0.28,
          easedLogoProgress
        );
        noteMaterial.emissiveIntensity = THREE.MathUtils.lerp(
          0.02,
          0.34,
          easedLogoProgress
        );

        noteRig.position.lerpVectors(
          restPosition,
          logoTargetPosition,
          easedLogoProgress
        );
        noteRig.scale.setScalar(
          THREE.MathUtils.lerp(1, LOGO_MODE_SCALE, easedLogoProgress)
        );

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
        container.removeEventListener("click", handleClick);
        container.style.cursor = "default";

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
        noteClickTarget.geometry.dispose();
        disposeMaterial(noteClickTarget.material);

        scene.remove(noteRig);
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
    <section
      className={`scene-shell${isPromoted ? " scene-shell-logo" : ""}`}
    >
      <h1 className="sr-only">3D Metallic Musical Note</h1>
      <div ref={containerRef} className="scene-viewport" />
    </section>
  );
}

function createNoteMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: HOME_NOTE_COLOR.clone(),
    emissive: HOME_NOTE_EMISSIVE.clone(),
    emissiveIntensity: 0.02,
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

  return noteGroup;
}

function screenToWorldOnPlane(
  camera: THREE.PerspectiveCamera,
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  planeZ: number
) {
  const pointer = new THREE.Vector3(
    (screenX / viewportWidth) * 2 - 1,
    -(screenY / viewportHeight) * 2 + 1,
    0.5
  );
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  pointer.unproject(camera);

  const direction = pointer.sub(camera.position).normalize();
  const distance = (planeZ - camera.position.z) / direction.z;

  return camera.position.clone().add(direction.multiplyScalar(distance));
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
