import * as AFRAME from "aframe"

AFRAME.registerComponent('billboard', {
    init() {
        this.element = this.el.object3D
        this.camera = this.el.sceneEl.camera
        this.cameraPos = new THREE.Vector3()
    },

    tick() {        
        this.camera.getWorldPosition(this.cameraPos)
        this.element.lookAt(this.cameraPos)
    }
})

AFRAME.registerComponent('auto-scale', {
    schema: {
        factor: { type: 'number', default: 1.0 },
        enabled: { type: 'boolean', default: true }
    },

    init() {
        this.originalScale = this.el.object3D.scale.clone()
        this.camera = this.el.sceneEl.camera
        this.cameraPos = new THREE.Vector3()

        this.captureInitialDistance()
        this.camera.el.addEventListener('loaded', () => this.captureInitialDistance())
    },

    tick() {
        if (!this.data.enabled) return

        if (this.el.components["fit-into-fov"]) {
            this.el.components["fit-into-fov"].setScale()
        } else {
            this.el.object3D.scale.copy(this.calculateNewScale())
        }
    },

    captureInitialDistance() {
        this.camera.getWorldPosition(this.cameraPos)
        this.initialDistance = this.cameraPos.distanceTo(this.el.object3D.position)
    },

    calculateNewScale() {
        if (!this.data.enabled) return null

        this.camera.getWorldPosition(this.cameraPos)

        const distance = this.cameraPos.distanceTo(this.el.object3D.position)
        const normalizedDistance = distance / this.initialDistance

        return this.originalScale.clone().multiplyScalar(normalizedDistance * this.data.factor)
    }

})

AFRAME.registerComponent('follow-camera', {
    schema: {
        distance: { type: "number", default: 2.0 },
        angle: { type: "number", default: 0.0 },
        duration: { type: "number", default: 500 },
        horizontal: { type: "boolean", default: false },
    },

    init() {
        this.camera = this.el.sceneEl.camera

        this.cameraPos = new THREE.Vector3()
        this.cameraDir = new THREE.Vector3()

        this.vecBetweenCameraAndEl = new THREE.Vector3()
        this.angleBetweenCameraAndEl = 0.0
        this.targetPos = new THREE.Vector3()

        this.initialElPosY = this.el.object3D.position.y

        // Default angle
        if (this.data.angle === 0.0) {
            this.data.angle = this.camera.fov * this.camera.aspect / 2
        }

        this.setupAnimation()
    },

    tick() {    
        this.camera.getWorldPosition(this.cameraPos)
        this.camera.getWorldDirection(this.cameraDir)
        
        this.vecBetweenCameraAndEl
            = this.el.object3D.position.clone()
                .sub(this.cameraPos).multiplyScalar(1)

        this.angleBetweenCameraAndEl = this.vecBetweenCameraAndEl.angleTo(this.cameraDir) * (180 / Math.PI)
        
        const targetPos = this.cameraPos.clone().add(this.cameraDir.clone().multiplyScalar(this.data.distance))

        if (this.angleBetweenCameraAndEl > this.data.angle && this.targetPos.distanceTo(targetPos) > 0.1) {
            const y = this.data.horizontal ? this.initialElPosY : targetPos.y

            this.el.setAttribute("animation__follow-camera", "to", `${targetPos.x} ${y} ${targetPos.z}`)
            this.targetPos = targetPos.clone()
        }
    },

    setupAnimation() {
        this.el.setAttribute("animation__follow-camera", {
            "property": "position",
            "to": this.el.object3D.position,
            "dur": this.data.duration,
            "easing": "linear",
            "loop": false
        })
    }
})

AFRAME.registerComponent('auto-position', {
    schema: {
        hAlign: { type: "string", default: "center" },
        vAlign: { type: "string", default: "center" },
        zIndex: { type: "number", default: 0 }
    },

    init() {
        this.validateSchema()
        this.setElAndParentBoundingBox()
    },

    validateSchema() {
        const hAlignOptions = { left: "left", center: "center", right: "right" }
        const vAlignOptions = { top: "top", center: "center", bottom: "bottom" }

        this.hAlignment = this.data.hAlign?.toLowerCase()
        this.vAlignment = this.data.vAlign?.toLowerCase()
        
        if (!(this.hAlignment in hAlignOptions) || !(this.vAlignment in vAlignOptions)) {
            this.hAlignment = hAlignOptions.center
            this.vAlignment = vAlignOptions.center

            console.warn(`Warning auto-position: invalid align value(s) [${this.el.tagName}], set to default`)
        }

        this.data.zIndex = isNaN(this.data.zIndex) ? 0 : this.data.zIndex
    },
    
    setElAlignment() {
        let x = 0
        let y = 0

        if (this.hAlignment === "left") {
            x = (-(this.parentBboxSize.x / 2)) + this.elBboxSize.x / 2
        } else if (this.hAlignment === "right") {
            x = this.parentBboxSize.x / 2 - this.elBboxSize.x / 2
        }

        if (this.vAlignment === "top") {
            y = this.parentBboxSize.y / 2 - this.elBboxSize.y / 2
        } else if (this.vAlignment === "bottom") {
            y = (-(this.parentBboxSize.y / 2)) + this.elBboxSize.y / 2
        }

        this.el.object3D.position.x = x
        this.el.object3D.position.y = y
        this.el.object3D.position.z = this.data.zIndex
    },
    
    setElAndParentBoundingBox() {
        // Need to wait for setting alignment, until the parent has been rendered
        this.el.sceneEl.addEventListener("loaded", () => {
            this.elBbox = new THREE.Box3().setFromObject(this.el.object3D)
            this.elBboxSize = this.elBbox.getSize(new THREE.Vector3())

            this.parentBbox = new THREE.Box3().setFromObject(this.el.parentNode.object3D)
            this.parentBboxSize = this.parentBbox.getSize(new THREE.Vector3())

            this.setElAlignment()
        })
    }
})

AFRAME.registerComponent('fit-into-fov', {
    schema: {
        percentage: { type: "number", default: 100 },
        useFrontFace: { type: "boolean", default: false }
    },

    validateSchema() {
        // A-Frame returns `NaN`, if the value of property doesn't conform to type in schema
        // Example: fit-into-fov="percentage: aaaa" will return `NaN` (default value won't be used)
        // Thus there is a below check
        if (isNaN(this.data.percentage) || this.data.percentage < 0) {
            console.warn("Warning fit-into-fov: percentage must be a positive number")
            this.data.percentage = 100
        }
    },

    init() {
        this.validateSchema()

        this.camera = this.el.sceneEl.camera
        this.el.object3D.scale.set(1, 1, 1)
        
        this.el.sceneEl.addEventListener("loaded", () => {
            this.computeBBox()
            this.setScale()
            this.el.addEventListener("fit", () => {
                this.setScale()
            })
        })
    },

    computeBBox() {
        const tempRotation = this.el.object3D.rotation.clone()
        this.el.object3D.rotation.set(0, 0, 0) // reset rotation to compute correct original bbox
        this.bbox = new THREE.Box3().setFromObject(this.el.object3D)
        this.el.object3D.rotation.copy(tempRotation)
    },

    calculateNewScale() {
        const elementPos = this.el.object3D.position
        const cameraPos = this.camera.getWorldPosition(new THREE.Vector3())
        const distanceToCenter = Math.abs(cameraPos.distanceTo(elementPos))
        const vFOV = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
        const bboxSize = this.bbox.getSize(new THREE.Vector3())

        let difference = 100
        let oldScale = 1
        let newScale = 1
        let count = 0

        while (difference > 0.05 && count < 100) {
            const distanceToFrontFace = distanceToCenter - newScale * bboxSize.z / 2 // modify the distance, so we use the front face of the object, not its center
            const distance = this.data.useFrontFace ? distanceToFrontFace : distanceToCenter
            const visibleHeight = vFOV * distance
            const visibleWidth = visibleHeight * this.camera.aspect

            const scaleByVisibleHeight = (visibleHeight / bboxSize.y) * this.data.percentage / 100
            const scaleByVisibleWidth = (visibleWidth / bboxSize.x) * this.data.percentage / 100

            newScale = Math.min(scaleByVisibleWidth, scaleByVisibleHeight)
            difference = Math.abs(newScale - oldScale)
            
            oldScale = newScale
            count++
        }

        if (count >= 100) {
            console.warn("Warning fit-into-fov: calculation of new scale took too long, fit-into-fov might not work properly")
        }

        return new THREE.Vector3(newScale, newScale, newScale)
    },

    setScale() {
        const newScale = this.calculateNewScale()
        this.el.object3D.scale.copy(newScale)
    }
})