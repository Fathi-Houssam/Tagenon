import { Component, OnInit } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  size: number = 27;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  controls!: OrbitControls;
  objectToScale!: THREE.Object3D;
  tabla!: THREE.Mesh;
  tajineLid!: THREE.Mesh;
  tajinePlate!: THREE.Mesh;
  raycaster: THREE.Raycaster = new THREE.Raycaster();
  pointer: THREE.Vector2 = new THREE.Vector2();
  uploadedDecalTexture: THREE.Texture | null = null;


  ngOnInit(): void {
    this.initThreeJS();
    this.toolkitbackground();
    this.ifIclickoutsidegetout();
  }

  initThreeJS(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('canvas') as HTMLCanvasElement,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight * 0.70);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xF5F5F5);


    const aspectRatio = window.innerWidth / (window.innerHeight * 0.70);
    this.camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
    this.camera.position.set(0, 5, 15);

    window.addEventListener('resize', this.onWindowResize.bind(this));

    const exrLoader = new EXRLoader();
    exrLoader.load('forest.exr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = texture;
    });

    const loader = new GLTFLoader();
    loader.load('Tajine+table.glb', (gltf) => {
      const model = gltf.scene;
      this.scene.add(model);

      this.tabla = model.getObjectByName('Sketchfab_model') as THREE.Mesh;
      const tajineLid = model.getObjectByName('Cylinder002') as THREE.Mesh;
      const tajinePlate = model.getObjectByName('Circle') as THREE.Mesh;



      if (!tajineLid || !tajinePlate) {
        console.error('Tajine parts not found in the model.');
        return;
      }

      const tajineGroup = new THREE.Group();
      tajineGroup.add(tajineLid);
      tajineGroup.add(tajinePlate);
      this.scene.add(tajineGroup);
      this.objectToScale = tajineGroup;

      this.tajineLid = tajineLid;
      this.tajinePlate = tajinePlate;

      this.setupCameraAndControls(this.tajineLid);
    });

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.0;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 1;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.minPolarAngle = -Math.PI / 2;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.update();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.animate();
  }

  setupCameraAndControls(object: THREE.Object3D): void {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    if (!box.isEmpty()) {
      box.getCenter(center);
      box.getSize(size);

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)));

      cameraZ *= 2;

      this.camera.position.set(center.x, center.y + maxDim * 0.5, cameraZ);
      this.camera.lookAt(center);

      this.controls.target.copy(center);
      this.controls.update();
    } else {
      console.error('Bounding box is empty or incorrect');
    }
  }


  onPointerDown(event: PointerEvent): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersectableMeshes = [this.tajineLid, this.tajinePlate].filter(
      (mesh) => mesh?.visible
    ) as THREE.Mesh[];

    const intersects = this.raycaster.intersectObjects(intersectableMeshes, true);

    if (intersects.length > 0 && this.uploadedDecalTexture) {
      const intersect = intersects[0];
      const intersectedObject = intersect.object as THREE.Mesh;

      const decalPosition = intersect.point.clone();
      const faceNormal = intersect.face?.normal.clone();

      if (faceNormal) {
        faceNormal.transformDirection(intersectedObject.matrixWorld).normalize();

        const upVector = new THREE.Vector3(0, 1, 0);
        const tangent = new THREE.Vector3().crossVectors(upVector, faceNormal).normalize();
        const correctedUp = new THREE.Vector3().crossVectors(faceNormal, tangent).normalize();

        const orientationMatrix = new THREE.Matrix4().makeBasis(tangent, correctedUp, faceNormal);
        const orientationEuler = new THREE.Euler().setFromRotationMatrix(orientationMatrix);

        const decalSize = new THREE.Vector3(0.02, 0.02, 0.01);

        const decalTexture = this.uploadedDecalTexture;
        decalTexture.colorSpace = THREE.SRGBColorSpace;

        const decalMaterial = new THREE.MeshStandardMaterial({
          map: decalTexture,
          transparent: true,
          depthWrite: false,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          side: THREE.DoubleSide,
        });

        const decalGeometry = new DecalGeometry(
          intersectedObject,
          decalPosition,
          orientationEuler,
          decalSize
        );

        const decalMesh = new THREE.Mesh(decalGeometry, decalMaterial);
        this.scene.add(decalMesh);

        const userData = intersectedObject.userData as { decals?: THREE.Mesh[] };
        if (!userData.decals) {
          userData.decals = [];
        }
        userData.decals.push(decalMesh);
      }
    }
    this.renderScene();
  }


  onWindowResize(): void {
    this.camera.aspect = window.innerWidth / (window.innerHeight * 0.70);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight * 0.70);
  }

  animate(): void {
    requestAnimationFrame(() => this.animate());

    this.renderer.render(this.scene, this.camera);

    if (this.tajinePlate) {
      const platePosition = new THREE.Vector3();
      this.tajinePlate.getWorldPosition(platePosition);
      this.controls.target.copy(platePosition);
      this.controls.update();
    }
  }


  resizeModelToRealWorldDiameter(newDiameter: number): void {
    if (this.objectToScale && this.tajinePlate && this.tabla) {
      const originalDiameter = 26.7;
      const scaleFactor = newDiameter / originalDiameter;

      const allDecals: {
        mesh: THREE.Mesh,
        parentMesh: THREE.Mesh,
        position: THREE.Vector3,
        orientation: THREE.Euler,
        size: THREE.Vector3
      }[] = [];

      const lidUserData = this.tajineLid.userData as { decals?: THREE.Mesh[] };
      if (lidUserData.decals) {
        lidUserData.decals.forEach(decal => {
          allDecals.push({
            mesh: decal,
            parentMesh: this.tajineLid,
            position: decal.position.clone(),
            orientation: new THREE.Euler().copy(decal.rotation),
            size: new THREE.Vector3(0.15, 0.15, 2).multiplyScalar(this.objectToScale.scale.x)
          });
        });
        lidUserData.decals.forEach(decal => this.scene.remove(decal));
        lidUserData.decals = [];
      }

      const plateUserData = this.tajinePlate.userData as { decals?: THREE.Mesh[] };
      if (plateUserData.decals) {
        plateUserData.decals.forEach(decal => {
          allDecals.push({
            mesh: decal,
            parentMesh: this.tajinePlate,
            position: decal.position.clone(),
            orientation: new THREE.Euler().copy(decal.rotation),
            size: new THREE.Vector3(0.15, 0.15, 2).multiplyScalar(this.objectToScale.scale.x)
          });
        });
        plateUserData.decals.forEach(decal => this.scene.remove(decal));
        plateUserData.decals = [];
      }

      this.objectToScale.scale.set(scaleFactor, scaleFactor, scaleFactor);

      allDecals.forEach(decalInfo => {
        const material = decalInfo.mesh.material as THREE.MeshStandardMaterial;

        const newPosition = decalInfo.position.clone().multiplyScalar(scaleFactor/decalInfo.parentMesh.scale.x);

        const decalGeometry = new DecalGeometry(
          decalInfo.parentMesh,
          newPosition,
          decalInfo.orientation,
          decalInfo.size.clone().multiplyScalar(scaleFactor/this.objectToScale.scale.x)
        );

        const newDecalMesh = new THREE.Mesh(decalGeometry, material);
        this.scene.add(newDecalMesh);

        const parentUserData = decalInfo.parentMesh.userData as { decals?: THREE.Mesh[] };
        if (!parentUserData.decals) {
          parentUserData.decals = [];
        }
        parentUserData.decals.push(newDecalMesh);
      });

      const tableBox = new THREE.Box3().setFromObject(this.tabla);
      const tableTopY = tableBox.max.y;

      const objectBox = new THREE.Box3().setFromObject(this.objectToScale);
      const objectBottomY = objectBox.min.y;

      const offsetY = tableTopY - objectBottomY;
      this.objectToScale.position.y += offsetY;
    }

    this.renderScene();
  }


  currentView: 'full' | 'lid' | 'plate' = 'full';

  LidView(): void {
    if (this.currentView === 'lid') return;

    if (this.tajineLid && this.tajinePlate && this.tabla) {
      this.tajinePlate.visible = false;
      this.tabla.visible = false;
      this.tajineLid.visible = true;

      this.toggleDecals(this.tajineLid, true);
      this.toggleDecals(this.tajinePlate, false);

      this.setupCameraAndControls(this.tajineLid);
      this.enforceVisibility();

      this.currentView = 'lid';
    }
  }

  plateView(): void {
    if (this.currentView === 'plate') return;

    if (this.tajineLid && this.tajinePlate && this.tabla) {
      this.tajineLid.visible = false;
      this.tabla.visible = false;
      this.tajinePlate.visible = true;

      this.toggleDecals(this.tajinePlate, true);
      this.toggleDecals(this.tajineLid, false);

      this.setupCameraAndControls(this.tajinePlate);

      this.currentView = 'plate';
      this.renderScene();
    }
  }

  restoreOriginalView(): void {
    if (this.currentView === 'full') return;

    if (this.tajineLid && this.tajinePlate && this.tabla) {
      this.tajineLid.visible = true;
      this.tajinePlate.visible = true;
      this.tabla.visible = true;

      this.toggleDecals(this.tajineLid, true);
      this.toggleDecals(this.tajinePlate, true);

      this.setupCameraAndControls(this.objectToScale);

      this.currentView = 'full';
      this.renderScene();
    }
  }


  toggleDecals(mesh: THREE.Mesh, visible: boolean): void {
    const userData = mesh.userData as { decals?: THREE.Mesh[] };
    if (userData.decals) {
      userData.decals.forEach((decal) => {
        decal.visible = visible;
      });
    }
  }


  onTextureUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const texturePath = e.target?.result as string;
      this.applyTextureToModel(texturePath);
    };
    reader.readAsDataURL(file);
  }

  triggerFileInput(): void {
    const input = document.getElementById('textureinput') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }


  applyTextureToModel(texturePath: string): void {
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load(
      texturePath,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;

        if (this.tajineLid.visible && !this.tajinePlate.visible) {
          this.applyTextureToMesh(this.tajineLid, texture);
        } else if (this.tajinePlate.visible && !this.tajineLid.visible) {
          this.applyTextureToMesh(this.tajinePlate, texture);
        } else if (this.tajineLid.visible && this.tajinePlate.visible) {
          this.applyTextureToMesh(this.tajineLid, texture);
          this.applyTextureToMesh(this.tajinePlate, texture);
        }
      },
      undefined,
      (error) => console.error('Error loading texture:', error)
    );
  }

  renderScene() {
    this.renderer.render(this.scene, this.camera);
  }


  applyTextureToMesh(object: THREE.Mesh, texture: THREE.Texture): void {
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        (material as THREE.MeshStandardMaterial).map = texture;
        (material as THREE.MeshStandardMaterial).needsUpdate = true;
      });
    } else {
      (object.material as THREE.MeshStandardMaterial).map = texture;
      (object.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
  }


  onDecalUpload(event: any): void {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const decalPath = e.target.result;
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        decalPath,
        (decalTexture) => {
          decalTexture.colorSpace = THREE.SRGBColorSpace;
          this.uploadedDecalTexture = decalTexture;
          this.applyDecalToMesh(decalPath);
        },
        undefined,
        (error) => console.error('Error loading decal texture:', error)
      );
    };
    reader.readAsDataURL(file);
  }

  applyDecalToMesh(decalPath: string): void {
    const loader = new THREE.TextureLoader();
    loader.load(
      decalPath,
      (decalTexture) => {
        decalTexture.colorSpace = THREE.SRGBColorSpace;

        const targetMesh = this.tajineLid.visible && !this.tajinePlate.visible
          ? this.tajineLid
          : this.tajinePlate.visible && !this.tajineLid.visible
            ? this.tajinePlate
            : this.tajinePlate;

        if (!targetMesh) {
          return;
        }

        const decalSize = new THREE.Vector3(2, 2, 0.1);
        const decalPosition = new THREE.Vector3(0, 0, 2);
        const worldPosition = decalPosition.clone();
        targetMesh.localToWorld(worldPosition);

        const decalOrientation = new THREE.Euler(0, 0, 0);

        const decalGeometry = new DecalGeometry(
          targetMesh,
          worldPosition,
          decalOrientation,
          decalSize
        );

        const decalMaterial = new THREE.MeshStandardMaterial({
          map: decalTexture,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 5,
          polygonOffsetUnits: 2,
        });

        const decalMesh = new THREE.Mesh(decalGeometry, decalMaterial);
        decalMesh.name = 'decal_' + Date.now();
        this.scene.add(decalMesh);


        const userData = targetMesh.userData as { decals?: THREE.Mesh[] };
        if (!userData.decals) {
          userData.decals = [];
        }
        userData.decals.push(decalMesh);

        this.renderScene();
      },
    );
  }

  enforceVisibility(): void {
    if (this.tajineLid && this.tajinePlate && this.tabla) {
      if (!this.tajineLid.visible) {
        this.toggleDecals(this.tajineLid, false);
      }
      if (!this.tajinePlate.visible) {
        this.toggleDecals(this.tajinePlate, false);
      }
      if (!this.tabla.visible) {
        this.tabla.visible = false;
      }
      this.renderScene();
    }
  }

  viewMode: 'carousel' | 'customization' = 'carousel';
  selectedPart: string | null = null;


  handleSelect(selected: string) {
    const carouselContent = document.querySelector('.carousel-content');

    if (carouselContent) {
      if (carouselContent.classList.contains('lift-down-content')){
        carouselContent.classList.remove('lift-down-content');
      }
      carouselContent.classList.add('lift-up-content');
    }

    this.selectedPart = selected;
    this.viewMode = 'customization';

    const targetView = selected === 'lid' ? 'lid' :
      selected === 'plate' ? 'plate' : 'full';

    if (this.currentView !== targetView) {
      if (selected === 'lid') {
        this.LidView();
      } else if (selected === 'plate') {
        this.plateView();
      } else {
        this.restoreOriginalView();
      }
    }
  }



  toolkitbackground() {
    const toolkit_main = document.querySelector('.toolkit-main') as HTMLElement;
    const top_bar = document.querySelector('.top-bar') as HTMLElement;
    if (toolkit_main && top_bar) {
      const color = this.scene.background as THREE.Color;
      toolkit_main.style.backgroundColor = `#${color.getHexString()}`;
      top_bar.style.backgroundColor = `#${color.getHexString()}`;
    }
  }


  ifIclickoutsidegetout() {
    let isDragging = false;
    let mouseDownX = 0;
    let mouseDownY = 0;
    const dragThreshold = 5;

    document.addEventListener('mousedown', (event) => {
      isDragging = false;
      mouseDownX = event.clientX;
      mouseDownY = event.clientY;
    });

    document.addEventListener('mousemove', (event) => {
      if (!isDragging) {
        const deltaX = Math.abs(event.clientX - mouseDownX);
        const deltaY = Math.abs(event.clientY - mouseDownY);
        if (deltaX > dragThreshold || deltaY > dragThreshold) {
          isDragging = true;
        }
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (isDragging || this.viewMode !== 'customization') return;

      const canvas = document.getElementById('canvas');
      const toolkit = document.querySelector('.toolkit-main');
      const clickedElement = event.target as Node;

      if (canvas && canvas.contains(clickedElement) &&
        toolkit && !toolkit.contains(clickedElement)) {

        this.viewMode = 'carousel';
        this.selectedPart = null;

        const carouselContent = document.querySelector('.carousel-content');
        if (carouselContent) {
          carouselContent.classList.remove('lift-up-content');
          carouselContent.classList.add('lift-down-content');

        }

        this.renderer.render(this.scene, this.camera);
      }
    });


  }

  activeView: 'slider' | 'texture' | 'stickers' = 'slider';

  sliderView(): void {
    console.log('Slider view activated');
    this.activeView = 'slider';

  }

  textureView(): void {
    console.log('Texture view activated');
    this.activeView = 'texture';
  }

  stickersView(): void {
    console.log('Stickers view activated');
    this.activeView = 'stickers';
  }


  applyDecalFromSticker(imageUrl: string): void {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      imageUrl,
      (decalTexture) => {
        decalTexture.colorSpace = THREE.SRGBColorSpace;
        this.uploadedDecalTexture = decalTexture;
      },
      undefined,
      (error) => console.error('Error loading decal texture:', error)
    );
  }
  triggerDecalInput(): void {
    const input = document.getElementById('decaleApply') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }

}
