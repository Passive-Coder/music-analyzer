"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type SubwooferSceneProps = {
  stage: "hidden" | "entering" | "visible" | "exiting";
};

const ENTER_DURATION = 0.34;
const EXIT_DURATION = 0.24;

export function SubwooferScene({ stage }: SubwooferSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef(stage);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const prefersMobileRenderer = window.innerWidth <= 620;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !prefersMobileRenderer,
    });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, prefersMobileRenderer ? 1.25 : 1.75)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "vote-song-workspace__subwoofer-scene-canvas";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.42, 21.6);
    camera.lookAt(0, 0.28, 0);

    const ambient = new THREE.AmbientLight(0xaab4c8, 1.9);
    const hemi = new THREE.HemisphereLight(0xd4deef, 0x06080d, 1.35);
    const key = new THREE.DirectionalLight(0xf1f5fb, 2.8);
    key.position.set(5.8, 7.2, 8.8);
    const fill = new THREE.PointLight(0x93a4bf, 1.9, 30, 2);
    fill.position.set(-6.2, 1.8, 5.4);
    const rim = new THREE.PointLight(0xffffff, 1.2, 24, 2);
    rim.position.set(3.4, -2.6, 7.8);
    scene.add(ambient, hemi, key, fill, rim);

    const rig = new THREE.Group();
    rig.scale.set(0.88, 0.88, 2.64);
    scene.add(rig);

    const boxMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3f434b,
      metalness: 0.26,
      roughness: 0.72,
      clearcoat: 0.12,
      clearcoatRoughness: 0.4,
    });
    const sideMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x6f747d,
      metalness: 0.34,
      roughness: 0.62,
    });
    const baffleMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2c3037,
      metalness: 0.18,
      roughness: 0.78,
    });
    const trimMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x171a1f,
      metalness: 0.44,
      roughness: 0.48,
    });
    const coneMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1a1d22,
      metalness: 0.08,
      roughness: 0.9,
    });
    const capMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x25292f,
      metalness: 0.12,
      roughness: 0.74,
    });

    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 10.8, 2.9),
      [
        sideMaterial,
        sideMaterial,
        sideMaterial,
        sideMaterial,
        boxMaterial,
        trimMaterial,
      ]
    );
    rig.add(cabinet);

    const frontPanel = new THREE.Mesh(
      new THREE.BoxGeometry(7.9, 10.45, 0.34),
      baffleMaterial
    );
    frontPanel.position.z = 1.46;
    rig.add(frontPanel);

    const faceInset = new THREE.Mesh(
      new THREE.BoxGeometry(7.32, 9.86, 0.18),
      new THREE.MeshPhysicalMaterial({
        color: 0x353942,
        metalness: 0.16,
        roughness: 0.82,
      })
    );
    faceInset.position.z = 1.56;
    rig.add(faceInset);

    const speakerGroup = new THREE.Group();
    speakerGroup.position.set(0, 1.24, 1.78);
    rig.add(speakerGroup);

    const outerTrim = new THREE.Mesh(
      new THREE.TorusGeometry(2.62, 0.25, 40, 96),
      trimMaterial
    );
    speakerGroup.add(outerTrim);

    const surround = new THREE.Mesh(
      new THREE.TorusGeometry(2.08, 0.48, 40, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0x20242a,
        metalness: 0.08,
        roughness: 0.95,
      })
    );
    speakerGroup.add(surround);

    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 2.08, 1.14, 64, 1, false),
      coneMaterial
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.z = -0.12;
    speakerGroup.add(cone);

    const coneInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 1.46, 0.74, 64, 1, false),
      new THREE.MeshPhysicalMaterial({
        color: 0x111318,
        metalness: 0.06,
        roughness: 0.94,
      })
    );
    coneInner.rotation.x = Math.PI / 2;
    coneInner.position.z = 0.05;
    speakerGroup.add(coneInner);

    const dustCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.96, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2),
      capMaterial
    );
    dustCap.scale.set(1, 1, 0.5);
    dustCap.position.z = 0.14;
    speakerGroup.add(dustCap);

    const screwGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 20);
    const screwMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d0f12,
      metalness: 0.74,
      roughness: 0.34,
    });
    const screwOffsets: Array<[number, number]> = [
      [-3.24, 4.42],
      [3.24, 4.42],
      [-3.24, -4.42],
      [3.24, -4.42],
      [-2.72, 2.44],
      [2.72, 2.44],
      [-2.72, -0.12],
      [2.72, -0.12],
    ];
    screwOffsets.forEach(([x, y]) => {
      const screw = new THREE.Mesh(screwGeometry, screwMaterial);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x, y, 1.66);
      rig.add(screw);
    });

    const portGeometry = new THREE.CylinderGeometry(0.72, 0.72, 0.94, 48);
    const portInnerMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x090a0d,
      metalness: 0.08,
      roughness: 0.96,
    });
    const portOuterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1d2026,
      metalness: 0.24,
      roughness: 0.76,
    });

    [-2.58, 0, 2.58].forEach((x, index) => {
      const portShell = new THREE.Mesh(
        new THREE.TorusGeometry(index === 1 ? 0.54 : 0.68, 0.12, 28, 56),
        portOuterMaterial
      );
      portShell.position.set(x, -3.86, 1.82);
      rig.add(portShell);

      const port = new THREE.Mesh(portGeometry, portInnerMaterial);
      port.rotation.x = Math.PI / 2;
      port.scale.setScalar(index === 1 ? 0.84 : 1);
      port.position.set(x, -3.86, 1.38);
      rig.add(port);
    });

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    let currentStage = stageRef.current;
    let stageElapsed = currentStage === "visible" ? ENTER_DURATION : 0;

    const resetStage = (nextStage: typeof currentStage) => {
      currentStage = nextStage;
      stageElapsed = 0;
    };

    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.033);
      const nextStage = stageRef.current;

      if (nextStage !== currentStage) {
        resetStage(nextStage);
      }

      stageElapsed += delta;
      const time = clock.elapsedTime;
      const pulse = Math.sin(time * 3.2) * 0.5 + 0.5;
      const coneTravel = 0.06 + pulse * 0.16;

      cone.position.z = -0.18 + coneTravel;
      coneInner.position.z = 0.04 + coneTravel * 0.82;
      dustCap.position.z = 0.14 + coneTravel * 0.34;
      speakerGroup.scale.setScalar(1 + pulse * 0.012);

      let motionProgress = 1;
      if (currentStage === "entering") {
        motionProgress = THREE.MathUtils.smootherstep(
          Math.min(stageElapsed / ENTER_DURATION, 1),
          0,
          1
        );
        rig.position.x = THREE.MathUtils.lerp(-3.6, 0, motionProgress);
        rig.rotation.y = THREE.MathUtils.lerp(0.34, 0, motionProgress);
        rig.rotation.z = THREE.MathUtils.lerp(-0.04, 0, motionProgress);
      } else if (currentStage === "exiting") {
        motionProgress = THREE.MathUtils.smootherstep(
          Math.min(stageElapsed / EXIT_DURATION, 1),
          0,
          1
        );
        rig.position.x = THREE.MathUtils.lerp(0, -2.8, motionProgress);
        rig.rotation.y = THREE.MathUtils.lerp(0, -0.28, motionProgress);
        rig.rotation.z = THREE.MathUtils.lerp(0, 0.03, motionProgress);
      } else {
        rig.position.x = 0;
        rig.rotation.y = 0;
        rig.rotation.z = 0;
      }

      const idleTilt = currentStage === "visible" ? Math.sin(time * 0.9) * 0.025 : 0;
      rig.rotation.x = idleTilt;
      rig.position.y = Math.sin(time * 1.18) * 0.08;
      rig.position.z = 1.04 + pulse * 0.14;

      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener("resize", resize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    };
  }, []);

  return <div ref={containerRef} className="vote-song-workspace__subwoofer-scene" />;
}
