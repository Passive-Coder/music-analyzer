"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const DESCRIPTION =
  "A centered metallic blue-silver 3D music note tilted 15 degrees clockwise on a deep blue-black background with intense moving cobalt and electric-blue accents.";
const LIGHT_MOTION_MULTIPLIER = 1.5;
const IDLE_TILT_LIMIT = THREE.MathUtils.degToRad(5);
const BASE_NOTE_TILT = -Math.PI / 12;
const LOGO_MODE_SCALE = 0.28;
const LOGO_TRANSITION_DURATION = 1.25;
const FULL_ROTATION = Math.PI * 2;
const PUBLISH_RAINBOW_DURATION = 0.5;
const PUBLISH_EFFECT_DURATION = 0.96;
const HOME_NOTE_COLOR = new THREE.Color(0xc8dbff);
const LOGO_NOTE_COLOR = new THREE.Color(0x153974);
const HOME_NOTE_EMISSIVE = new THREE.Color(0x0d214b);
const LOGO_NOTE_EMISSIVE = new THREE.Color(0x1f5bc4);
const HOME_KEY_LIGHT_COLOR = new THREE.Color(0xd6e9ff);
const LOGO_KEY_LIGHT_COLOR = new THREE.Color(0xaed0ff);
const HOME_FILL_LIGHT_COLOR = new THREE.Color(0x4e82ff);
const LOGO_FILL_LIGHT_COLOR = new THREE.Color(0x88bcff);
const HOME_RIM_LIGHT_COLOR = new THREE.Color(0x2a59df);
const LOGO_RIM_LIGHT_COLOR = new THREE.Color(0xb0d8ff);
const HOME_FRONT_LIGHT_COLOR = new THREE.Color(0x7ba7ff);
const LOGO_FRONT_LIGHT_COLOR = new THREE.Color(0xd7ebff);
const LOGO_CLICK_TARGET_SIZE = new THREE.Vector3(8.8, 9.6, 4.4);
type NoteDock = "center" | "top-right" | "top-left";

type NoteSceneProps = {
  dock?: NoteDock;
  isPromoted?: boolean;
  publishEffectToken?: number;
  volumeFill?: number;
  onNoteClick?: () => void;
  onTransitionComplete?: (dock: NoteDock) => void;
};

type VolumeWaveDirection = "inbound" | "outbound";

export function NoteScene({
  dock = "center",
  isPromoted = false,
  publishEffectToken = 0,
  volumeFill = 0,
  onNoteClick,
  onTransitionComplete,
}: NoteSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveLayerRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<NoteDock>(dock);
  const previousDockRef = useRef<NoteDock>(dock);
  const publishEffectTokenRef = useRef(publishEffectToken);
  const volumeFillRef = useRef(volumeFill);
  const previousVolumeFillRef = useRef(volumeFill);
  const onNoteClickRef = useRef(onNoteClick);
  const onTransitionCompleteRef = useRef(onTransitionComplete);
  const [volumeWave, setVolumeWave] = useState<{
    direction: VolumeWaveDirection;
    token: number;
  } | null>(null);

  useEffect(() => {
    dockRef.current = dock;
  }, [dock]);

  useEffect(() => {
    onNoteClickRef.current = onNoteClick;
  }, [onNoteClick]);

  useEffect(() => {
    publishEffectTokenRef.current = publishEffectToken;
  }, [publishEffectToken]);

  useEffect(() => {
    volumeFillRef.current = volumeFill;
  }, [volumeFill]);

  useEffect(() => {
    const previousDock = previousDockRef.current;
    const previousVolumeFill = previousVolumeFillRef.current;

    previousDockRef.current = dock;
    previousVolumeFillRef.current = volumeFill;

    if (dock !== "top-left" || previousDock !== "top-left") {
      return;
    }

    const fillDelta = volumeFill - previousVolumeFill;

    if (Math.abs(fillDelta) < 0.0001) {
      return;
    }

    setVolumeWave((currentWave) => ({
      direction: fillDelta > 0 ? "outbound" : "inbound",
      token: (currentWave?.token ?? 0) + 1,
    }));
  }, [dock, volumeFill]);

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

      const hemiLight = new THREE.HemisphereLight(0xcfe1ff, 0x020916, 0.2);
      scene.add(hemiLight);

      const keyLight = new THREE.SpotLight(
        HOME_KEY_LIGHT_COLOR,
        15.2,
        42,
        Math.PI / 5,
        0.38,
        1.7
      );
      keyLight.position.set(4.2, 5.6, 10.1);
      scene.add(keyLight);
      scene.add(keyLight.target);

      const fillLight = new THREE.PointLight(HOME_FILL_LIGHT_COLOR, 9.4, 0, 2);
      fillLight.position.set(-5.8, 1.8, 7.2);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(HOME_RIM_LIGHT_COLOR, 8.1, 0, 2);
      rimLight.position.set(5.1, -1.8, 5.8);
      scene.add(rimLight);

      const frontLight = new THREE.DirectionalLight(HOME_FRONT_LIGHT_COLOR, 1.55);
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
      const topRightTargetPosition = new THREE.Vector3();
      const topLeftTargetPosition = new THREE.Vector3();
      const raycaster = new THREE.Raycaster();
      const raycastPointer = new THREE.Vector2();
      const noteMeshes: THREE.Object3D[] = [noteClickTarget];
      const noteWorldPosition = new THREE.Vector3();

      note.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          noteMeshes.push(child);
        }
      });

      let transitionProgress = dockRef.current === "center" ? 0 : 1;
      let transitionStartProgress = transitionProgress;
      let transitionEndProgress = transitionProgress;
      let transitionElapsed = 0;
      let isTransitioning = false;
      let activeTargetDock: NoteDock = dockRef.current;
      let activeTransitionDock: Exclude<NoteDock, "center"> =
        dockRef.current === "top-left" ? "top-left" : "top-right";
      let pendingCompletionTarget: NoteDock | null = null;
      let lastPublishEffectToken = publishEffectTokenRef.current;
      let publishEffectElapsed = Number.POSITIVE_INFINITY;
      const rainbowColor = new THREE.Color();
      const rainbowGlowColor = new THREE.Color();

      const beginTransition = (targetDock: NoteDock) => {
        activeTargetDock = targetDock;
        if (targetDock !== "center") {
          activeTransitionDock = targetDock;
        }
        transitionStartProgress = transitionProgress;
        transitionEndProgress = targetDock === "center" ? 0 : 1;
        transitionElapsed = 0;
        isTransitioning = true;
        pendingCompletionTarget = targetDock;
      };

      const isNoteClickable = () =>
        activeTargetDock !== "center" &&
        !isTransitioning &&
        transitionProgress >= 0.999;

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

      const handleClick = (event: PointerEvent) => {
        if (!isNoteClickable()) {
          return;
        }

        if (isPointerOverNote(event)) {
          onNoteClickRef.current?.();
        }
      };

      container.addEventListener("click", handleClick);

      const resize = () => {
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        renderer.setSize(width, height, false);
        topRightTargetPosition.copy(
          screenToWorldOnPlane(
            camera,
            width - Math.min(width * 0.1, 140),
            Math.max(height * 0.095, 64),
            width,
            height,
            0
          )
        );
        topLeftTargetPosition.copy(
          screenToWorldOnPlane(
            camera,
            Math.min(width * 0.1, 132),
            Math.max(height * 0.1, 68),
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
        const targetDock = dockRef.current;

        if (publishEffectTokenRef.current !== lastPublishEffectToken) {
          lastPublishEffectToken = publishEffectTokenRef.current;
          publishEffectElapsed = 0;
        }

        if (targetDock !== activeTargetDock) {
          beginTransition(targetDock);
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
              onTransitionCompleteRef.current?.(pendingCompletionTarget);
              pendingCompletionTarget = null;
            }
          }
        } else {
          transitionProgress = activeTargetDock === "center" ? 0 : 1;
        }

        const easedLogoProgress = transitionProgress;
        const idleInfluence = 1 - easedLogoProgress;
        const idleRotationPhase = clock.elapsedTime * 0.9;

        note.rotation.x =
          Math.sin(idleRotationPhase * 0.92) *
          IDLE_TILT_LIMIT *
          0.42 *
          idleInfluence;
        note.rotation.y =
          Math.cos(idleRotationPhase * 1.08 + 0.6) *
            IDLE_TILT_LIMIT *
            0.7 *
            idleInfluence +
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
        keyLight.color.lerpColors(
          HOME_KEY_LIGHT_COLOR,
          LOGO_KEY_LIGHT_COLOR,
          easedLogoProgress
        );
        fillLight.color.lerpColors(
          HOME_FILL_LIGHT_COLOR,
          LOGO_FILL_LIGHT_COLOR,
          easedLogoProgress
        );
        rimLight.color.lerpColors(
          HOME_RIM_LIGHT_COLOR,
          LOGO_RIM_LIGHT_COLOR,
          easedLogoProgress
        );
        frontLight.color.lerpColors(
          HOME_FRONT_LIGHT_COLOR,
          LOGO_FRONT_LIGHT_COLOR,
          easedLogoProgress
        );
        keyLight.intensity = THREE.MathUtils.lerp(15.2, 6.8, easedLogoProgress);
        fillLight.intensity = THREE.MathUtils.lerp(9.4, 4.3, easedLogoProgress);
        rimLight.intensity = THREE.MathUtils.lerp(8.1, 11.6, easedLogoProgress);
        frontLight.intensity = THREE.MathUtils.lerp(1.55, 2.35, easedLogoProgress);
        noteMaterial.metalness = THREE.MathUtils.lerp(1, 0.08, easedLogoProgress);
        noteMaterial.roughness = THREE.MathUtils.lerp(
          0.12,
          0.22,
          easedLogoProgress
        );
        noteMaterial.envMapIntensity = THREE.MathUtils.lerp(
          3.7,
          1.1,
          easedLogoProgress
        );
        noteMaterial.clearcoat = THREE.MathUtils.lerp(0.38, 0.24, easedLogoProgress);
        noteMaterial.clearcoatRoughness = THREE.MathUtils.lerp(
          0.06,
          0.08,
          easedLogoProgress
        );
        noteMaterial.emissiveIntensity = THREE.MathUtils.lerp(
          0.08,
          0.22,
          easedLogoProgress
        );

        const targetPosition =
          activeTransitionDock === "top-left"
            ? topLeftTargetPosition
            : topRightTargetPosition;
        noteRig.position.lerpVectors(restPosition, targetPosition, easedLogoProgress);
        noteRig.scale.setScalar(
          THREE.MathUtils.lerp(1, LOGO_MODE_SCALE, easedLogoProgress)
        );

        noteRig.updateWorldMatrix(true, true);
        noteRig.getWorldPosition(noteWorldPosition);
        noteWorldPosition.project(camera);
        waveLayerRef.current?.style.setProperty(
          "--note-wave-x",
          `${(noteWorldPosition.x * 0.5 + 0.5) * container.clientWidth}px`
        );
        waveLayerRef.current?.style.setProperty(
          "--note-wave-y",
          `${(-noteWorldPosition.y * 0.5 + 0.5) * container.clientHeight}px`
        );

        if (Number.isFinite(publishEffectElapsed)) {
          publishEffectElapsed += delta;

          const rainbowBlend = THREE.MathUtils.clamp(
            1 -
              Math.max(publishEffectElapsed - PUBLISH_RAINBOW_DURATION, 0) /
                Math.max(PUBLISH_EFFECT_DURATION - PUBLISH_RAINBOW_DURATION, 0.001),
            0,
            1
          );

          if (rainbowBlend > 0) {
            rainbowColor.setHSL(
              (0.04 + publishEffectElapsed * 1.9) % 1,
              0.9,
              0.56
            );
            rainbowGlowColor.copy(rainbowColor).offsetHSL(0.08, -0.06, 0.18);

            noteMaterial.color.lerp(rainbowColor, 0.92 * rainbowBlend);
            noteMaterial.emissive.lerp(rainbowGlowColor, 0.78 * rainbowBlend);
            keyLight.color.lerp(rainbowGlowColor, 0.74 * rainbowBlend);
            fillLight.color.lerp(rainbowColor, 0.68 * rainbowBlend);
            rimLight.color.lerp(rainbowGlowColor, 0.88 * rainbowBlend);
            frontLight.color.lerp(rainbowColor, 0.6 * rainbowBlend);
            noteMaterial.emissiveIntensity = THREE.MathUtils.lerp(
              noteMaterial.emissiveIntensity,
              0.6,
              rainbowBlend
            );
            noteMaterial.envMapIntensity = THREE.MathUtils.lerp(
              noteMaterial.envMapIntensity,
              2.3,
              rainbowBlend
            );
          }

          if (publishEffectElapsed >= PUBLISH_EFFECT_DURATION) {
            publishEffectElapsed = Number.POSITIVE_INFINITY;
          }
        }

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
      <div ref={waveLayerRef} className="note-scene__volume-wave-layer" aria-hidden="true">
        {volumeWave ? (
          <div
            key={`${volumeWave.direction}-${volumeWave.token}`}
            className={`note-scene__volume-wave note-scene__volume-wave--${volumeWave.direction}`}
          />
        ) : null}
      </div>
      <div ref={containerRef} className="scene-viewport" />
    </section>
  );
}

function createNoteMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: HOME_NOTE_COLOR.clone(),
    emissive: HOME_NOTE_EMISSIVE.clone(),
    emissiveIntensity: 0.08,
    metalness: 1,
    roughness: 0.08,
    envMapIntensity: 2.9,
    clearcoat: 0.44,
    clearcoatRoughness: 0.04,
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
  environmentScene.background = new THREE.Color(0x04112b);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(24, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x081738, side: THREE.BackSide })
  );
  environmentScene.add(shell);

  environmentScene.add(new THREE.AmbientLight(0x173a7a, 0.22));

  const key = new THREE.PointLight(0xd9ebff, 8.6, 0, 2);
  key.position.set(5.8, 3.6, 7.6);
  environmentScene.add(key);

  const blue = new THREE.PointLight(0x5b8bff, 11.4, 0, 2);
  blue.position.set(-6.4, 2.2, 5.8);
  environmentScene.add(blue);

  const back = new THREE.PointLight(0x2357cc, 8.4, 0, 2);
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
      color: 0x4f8bff,
      opacity: 0.22,
      scale: 10.4,
      position: [-4.6, 2.4, -5.1],
      envRadius: 1.8,
      velocity: [0.28, 0.19, 0.08],
      bounds: [5.4, 3.3, 1.4],
    }),
    createGlowBody(texture, {
      color: 0x245df3,
      opacity: 0.24,
      scale: 8.8,
      position: [4.9, -2.1, -5.4],
      envRadius: 1.6,
      velocity: [-0.24, 0.26, -0.06],
      bounds: [5.8, 3.5, 1.6],
    }),
    createGlowBody(texture, {
      color: 0x88b1ff,
      opacity: 0.14,
      scale: 11.6,
      position: [0.2, 0.6, -5.8],
      envRadius: 1.9,
      velocity: [0.18, -0.22, 0.05],
      bounds: [4.8, 3.9, 1.2],
    }),
    createGlowBody(texture, {
      color: 0x2f74ff,
      opacity: 0.16,
      scale: 9.4,
      position: [2.7, 2.8, -5.3],
      envRadius: 1.55,
      velocity: [-0.2, -0.18, 0.06],
      bounds: [4.9, 3.2, 1.5],
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
