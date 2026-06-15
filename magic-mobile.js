// magic-mobile.js — Mobile version (portrait, Kathy.png)
(() => {
    const MUSIC_URL = "./Em Không Lẻ Loi.mp3";
    let bgMusic = null;
    const loader = new THREE.TextureLoader();

    let photoFiles     = [];
    let photoTextures  = [];
    let photoDelays    = [];
    let galleryDelay   = 999999;
    let photoPositions = [];
    let photoRevealed    = [];
    let photoEmergePos   = [];
    let photoRevealTimes = [];
    let galleryTriggered = false;

    const MAX_PHOTOS = 12;
    const CLOUD_COUNT = 20;
    let sphereExpanded = false, rotMult = 1.0;
    let finaleStarted = false, finalePhaseStart = 0;
    let cloudStarted = false, cloudStartTime = 0;

    let heartFiles = ["final.png"];
    function getGalleryImageCount() { return Math.max(1, heartFiles.length); }

    // ── Glow textures ──────────────────────────────────────────────
    function makeGlowTex(r, g, b) {
        const c = document.createElement("canvas"); c.width = c.height = 128;
        const ctx = c.getContext("2d"), cx = 64;
        const grd = ctx.createRadialGradient(cx, cx, 0, cx, cx, 50);
        grd.addColorStop(0,    "rgba(255,255,255,1)");
        grd.addColorStop(0.12, `rgba(${r},${g},${b},1)`);
        grd.addColorStop(0.5,  `rgba(${r},${g},${b},0.7)`);
        grd.addColorStop(1,    `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
    }

    const TEX = {
        blue  : makeGlowTex(30,  130, 255),
        cyan  : makeGlowTex(0,   210, 255),
        ice   : makeGlowTex(160, 220, 255),
        white : makeGlowTex(255, 255, 255),
    };

    // ── Config (mobile-tuned) ──────────────────────────────────────
    const CFG = {
        sphereCount  : 2000,
        sphereRadius : 52,
        innerCount   : 400,
        innerRadius  : 27,
        rings: [
            { r:75, tube:3.5, count:350, tiltX: 7,  tiltZ:  0, tex:"cyan", hexColor:0x00CCFF, speed:0.0022 },
            { r:86, tube:2.5, count:300, tiltX:44,  tiltZ: 14, tex:"blue", hexColor:0x0088FF, speed:0.0048 },
            { r:66, tube:2.8, count:280, tiltX:-27, tiltZ: -9, tex:"ice",  hexColor:0xAADDFF, speed:0.0068 },
        ],
        galleryCount   : 300000,
        gallerySize    : 0.8,
        galleryZJitter : 1,
        revealStepMs   : 500,
        alphaThreshold : 8,
        pixelStep      : 2,
        pad            : 6,
        galleryY       : 0,
        gallerySpacing : 20,
        galleryScale   : 0.04,
    };

    // ── Scene state ────────────────────────────────────────────────
    let scene, photoScene, camera, renderer;
    let groupSphere, groupInner;
    const groupRings = [];
    let groupGallery = null;
    let gyroGroup = null;
    let photoMeshes  = [];
    let msgMesh, mc, mCtx, mTex;
    let msgWriteStart = -1, msgTextX = 0, msgTextW = 0;
    let subMsgMesh = null;

    let state     = "SPHERE";
    let started   = false;
    let startTime = 0;

    let galleryReady = false, galleryRevealCount = 0;
    let galleryTimer = null, galleryBuilding = false, msgShown = false;
    let gallerySequenceDone = false;

    // Gyroscope
    let rawGamma = 0, rawBeta = 0, gyroGamma = 0, gyroBeta = 0;

    // ── Helpers ────────────────────────────────────────────────────
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Grid 3-4-5 cho portrait mobile + cloud positions ngoài quả cầu
    function computePhotoPositions(n) {
        const layout   = [3, 4, 5];
        const xGap     = 14, yGap = 20, z = -40;
        const positions = [];
        let idx = 0;
        layout.forEach((count, row) => {
            const y = (layout.length - 1) / 2 * yGap - row * yGap;
            for (let col = 0; col < count && idx < MAX_PHOTOS; col++, idx++) {
                const x = (col - (count - 1) / 2) * xGap;
                positions.push(new THREE.Vector3(x, y, z));
            }
        });
        while (positions.length < Math.min(n, MAX_PHOTOS)) positions.push(new THREE.Vector3(0, 0, z));
        for (let i = positions.length; i < n; i++) {
            const phi   = Math.acos(2 * Math.random() - 1);
            const theta = Math.random() * Math.PI * 2;
            const r     = 90 + Math.random() * 40;
            positions.push(new THREE.Vector3(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi) * 0.65,
                r * Math.sin(phi) * Math.sin(theta)
            ));
        }
        return positions;
    }

    // ── Image → points (gallery) ───────────────────────────────────
    function cropAlphaBounds(img, alphaThreshold, pad, pixelStep) {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d", { willReadFrequently: true });
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y += pixelStep)
            for (let x = 0; x < width; x += pixelStep)
                if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
                    if (x < minX) minX = x; if (y < minY) minY = y;
                    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
                }
        if (maxX < 0) return { data, width, height };
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
        const w = maxX - minX + 1, h = maxY - minY + 1;
        const out = document.createElement("canvas"); out.width = w; out.height = h;
        const octx = out.getContext("2d", { willReadFrequently: true });
        octx.drawImage(c, minX, minY, w, h, 0, 0, w, h);
        const id = octx.getImageData(0, 0, w, h);
        return { data: id.data, width: w, height: h };
    }

    async function imageToPointTargets(url, count, cx, cy) {
        const img = await new Promise((res, rej) => {
            const im = new Image(); im.crossOrigin = "anonymous"; let tried = false;
            im.onload = () => res(im);
            im.onerror = () => { if (!tried) { tried = true; im.src = "./" + url; } else rej(new Error("Failed: " + url)); };
            im.src = url;
        });

        // Mobile: resize nhỏ hơn để tiết kiệm bộ nhớ
        const MAX_DIM = 1200;
        const origW = img.naturalWidth, origH = img.naturalHeight;
        const rs  = Math.min(MAX_DIM / origW, MAX_DIM / origH, 1);
        const rw  = Math.round(origW * rs), rh = Math.round(origH * rs);
        const rc  = document.createElement("canvas");
        rc.width = rw; rc.height = rh;
        const rctx = rc.getContext("2d", { willReadFrequently: true });
        rctx.drawImage(img, 0, 0, rw, rh);
        const { data } = rctx.getImageData(0, 0, rw, rh);

        const SCREEN_H = 2 * Math.tan(Math.PI / 6) * 130;
        const SCREEN_W = SCREEN_H * (camera ? camera.aspect : 9 / 16);

        const pts = [];
        let minX = rw, maxX = 0, minY = rh, maxY = 0, sumX = 0, sumY = 0;
        for (let y = 0; y < rh; y += CFG.pixelStep)
            for (let x = 0; x < rw; x += CFG.pixelStep)
                if (data[(y * rw + x) * 4 + 3] > CFG.alphaThreshold) {
                    pts.push([x, y]);
                    sumX += x; sumY += y;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }

        const useFallback = pts.length < 50;
        const centX = useFallback ? rw / 2 : sumX / pts.length;
        const centY = useFallback ? rh / 2 : sumY / pts.length;
        const cw = useFallback ? rw : Math.max(maxX - minX, 1);
        const ch = useFallback ? rh : Math.max(maxY - minY, 1);
        // Portrait image → fill 70% màn hình portrait
        const adjScale = Math.min((SCREEN_H * 0.70) / ch, (SCREEN_W * 0.70) / cw);

        const targets = new Float32Array(count * 3), colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            let px, py;
            if (useFallback) { px = Math.random() * rw; py = Math.random() * rh; }
            else { const p = pts[(Math.random() * pts.length) | 0]; px = p[0]; py = p[1]; }
            targets[i*3]   = (px - centX) * adjScale + cx;
            targets[i*3+1] = (centY - py) * adjScale + cy;
            targets[i*3+2] = (Math.random() - 0.5) * CFG.galleryZJitter;
            const di = (Math.floor(py) * rw + Math.floor(px)) * 4;
            colors[i*3] = data[di]/255; colors[i*3+1] = data[di+1]/255; colors[i*3+2] = data[di+2]/255;
        }
        return { targets, colors };
    }

    function randomCloud(count, spread = 120) {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const phi = Math.acos(2 * Math.random() - 1), lam = 2 * Math.PI * Math.random();
            const rad = spread * Math.cbrt(Math.random());
            arr[i*3]   = rad * Math.sin(phi) * Math.cos(lam);
            arr[i*3+1] = rad * Math.sin(phi) * Math.sin(lam);
            arr[i*3+2] = rad * Math.cos(phi);
        }
        return arr;
    }

    // ── Three.js helpers ───────────────────────────────────────────
    const getContainer = () => document.getElementById("canvas-container");

    function resizeToContainer() {
        const c = getContainer(); if (!c || !renderer || !camera) return;
        const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
        renderer.setSize(w, h, true); camera.aspect = w / h; camera.updateProjectionMatrix();
    }

    function fibonacciSphere(count, radius) {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const phi   = Math.acos(1 - 2 * (i + 0.5) / count);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            const rVar  = radius * (0.90 + Math.random() * 0.14);
            arr[i*3]   = rVar * Math.sin(phi) * Math.cos(theta);
            arr[i*3+1] = rVar * Math.cos(phi);
            arr[i*3+2] = rVar * Math.sin(phi) * Math.sin(theta);
        }
        return arr;
    }

    function blueColor() {
        const t = Math.random();
        if (t < 0.35) return [0.0,  0.78 + Math.random()*0.22, 1.0];
        if (t < 0.65) return [0.1 + Math.random()*0.15, 0.45 + Math.random()*0.35, 1.0];
        return [0.65 + Math.random()*0.35, 0.88 + Math.random()*0.12, 1.0];
    }

    function makePointCloud(count, sphereT, tex, size) {
        const pos   = new Float32Array(count * 3); pos.set(sphereT.subarray(0, count * 3));
        const col   = new Float32Array(count * 3);
        const base  = new Float32Array(count * 3);
        const phase = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const c = blueColor();
            col[i*3] = base[i*3] = c[0]; col[i*3+1] = base[i*3+1] = c[1]; col[i*3+2] = base[i*3+2] = c[2];
            phase[i] = Math.random() * Math.PI * 2;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
        geo.userData = { sphere: sphereT, base, phase };
        const mat = new THREE.PointsMaterial({
            size, map: tex, transparent: true, opacity: 1.0,
            vertexColors: true, blending: THREE.AdditiveBlending,
            depthWrite: false, sizeAttenuation: true,
        });
        return new THREE.Points(geo, mat);
    }

    function makeRing(def) {
        const count = def.count;
        const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
        const sphereT = new Float32Array(count * 3), phase = new Float32Array(count);
        const baseC   = new THREE.Color(def.hexColor);
        for (let i = 0; i < count; i++) {
            const theta = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
            const phi   = Math.random() * Math.PI * 2;
            const x = (def.r + def.tube * Math.cos(phi)) * Math.cos(theta);
            const y = def.tube * Math.sin(phi);
            const z = (def.r + def.tube * Math.cos(phi)) * Math.sin(theta);
            sphereT[i*3] = pos[i*3] = x; sphereT[i*3+1] = pos[i*3+1] = y; sphereT[i*3+2] = pos[i*3+2] = z;
            const b = 0.65 + Math.random() * 0.35;
            col[i*3] = baseC.r*b; col[i*3+1] = baseC.g*b; col[i*3+2] = baseC.b*b;
            phase[i] = Math.random() * Math.PI * 2;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
        geo.userData = { sphere: sphereT, phase, speed: def.speed, baseR: baseC.r, baseG: baseC.g, baseB: baseC.b };
        const mat = new THREE.PointsMaterial({
            size: 2.2, map: TEX[def.tex], transparent: true, opacity: 1.0,
            vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
        });
        const ring = new THREE.Points(geo, mat);
        ring.rotation.x = def.tiltX * Math.PI / 180;
        ring.rotation.z = def.tiltZ * Math.PI / 180;
        return ring;
    }

    function morph(group, key, speed = 0.07) {
        const pos = group.geometry.attributes.position.array;
        const t   = group.geometry.userData[key];
        if (!t) return;
        for (let i = 0; i < pos.length; i++) pos[i] += (t[i] - pos[i]) * speed;
        group.geometry.attributes.position.needsUpdate = true;
    }

    // ── Init ───────────────────────────────────────────────────────
    async function init3D() {
        const container = getContainer(); if (!container) return;
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000510, 0.0015);
        photoScene = new THREE.Scene();

        const w = container.clientWidth  || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 1400);
        camera.position.z = 130;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // mobile: giới hạn 1.5x DPI
        renderer.setSize(w, h, true);
        Object.assign(renderer.domElement.style, { width:"100%", height:"100%", display:"block" });
        container.appendChild(renderer.domElement);

        groupSphere = makePointCloud(CFG.sphereCount, fibonacciSphere(CFG.sphereCount, CFG.sphereRadius), TEX.blue, 2.2);
        groupInner  = makePointCloud(CFG.innerCount,  fibonacciSphere(CFG.innerCount,  CFG.innerRadius),  TEX.cyan, 1.5);

        gyroGroup = new THREE.Group();
        gyroGroup.add(groupSphere);
        gyroGroup.add(groupInner);
        CFG.rings.forEach(def => { const r = makeRing(def); groupRings.push(r); gyroGroup.add(r); });
        scene.add(gyroGroup);

        const borderMat = new THREE.MeshBasicMaterial({ color: 0x0099FF });
        photoFiles.forEach((_, i) => {
            const tex = photoTextures[i];
            const img = tex?.image;
            const asp = (img?.width && img?.height) ? img.width / img.height : 9 / 16;
            const bH  = 8, bW = bH * asp;
            if (tex) { tex.minFilter = tex.magFilter = THREE.LinearFilter; }
            const mesh   = new THREE.Mesh(new THREE.PlaneGeometry(bW, bH),
                                           new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
            const border = new THREE.Mesh(new THREE.PlaneGeometry(bW + 1, bH + 1), borderMat);
            border.position.z = -0.1; mesh.add(border);
            mesh.visible = false; mesh.scale.set(0, 0, 0);
            photoScene.add(mesh); photoMeshes.push(mesh);
        });

        // "For Ka Thy" text
        mc = document.createElement("canvas"); mc.width = 1024; mc.height = 256;
        mCtx = mc.getContext("2d");
        mCtx.clearRect(0, 0, 1024, 256);
        await document.fonts.load('700 120px "Dancing Script"');
        mCtx.font = '700 120px "Dancing Script", cursive'; mCtx.textAlign = "center";
        const _m = mCtx.measureText("Cảm ơn Ka Thy");
        msgTextX = Math.round(512 - _m.width / 2) - 8;
        msgTextW = Math.round(_m.width) + 16;
        mTex = new THREE.CanvasTexture(mc);
        const mMat = new THREE.MeshBasicMaterial({ map: mTex, transparent: true, blending: THREE.AdditiveBlending });
        msgMesh = new THREE.Mesh(new THREE.PlaneGeometry(70, 70 * 0.22), mMat);
        msgMesh.position.set(0, -48, 0); msgMesh.visible = false;
        scene.add(msgMesh);

        // Subtitle: "đã là một ngoại lệ thật đặc biệt ♡"
        const subMc = document.createElement("canvas"); subMc.width = 1024; subMc.height = 160;
        const subCtx = subMc.getContext("2d");
        subCtx.font = '700 52px "Dancing Script", cursive';
        subCtx.textAlign = "center"; subCtx.fillStyle = "#88CCFF";
        subCtx.shadowColor = "#00AAFF"; subCtx.shadowBlur = 20;
        subCtx.fillText("đã là một ngoại lệ thật đặc biệt ♡", 512, 80);
        const subTex = new THREE.CanvasTexture(subMc);
        const subMat = new THREE.MeshBasicMaterial({ map: subTex, transparent: true, blending: THREE.AdditiveBlending });
        subMsgMesh = new THREE.Mesh(new THREE.PlaneGeometry(78, 78 * 0.11), subMat);
        subMsgMesh.position.set(0, -52, 0); subMsgMesh.visible = false;
        scene.add(subMsgMesh);

        createGalleryPoints();
        buildGalleryTargets();

        resizeToContainer();
        animate();
    }

    // ── Gallery ────────────────────────────────────────────────────
    function createGalleryPoints() {
        const count   = CFG.galleryCount;
        const scatter = randomCloud(count, 140);
        const pos = new Float32Array(count * 3); pos.set(scatter);
        const sz  = new Float32Array(count);
        const col = new Float32Array(count * 3);
        const base = new THREE.Color(0x00AAFF);
        for (let i = 0; i < count; i++) { col[i*3] = base.r; col[i*3+1] = base.g; col[i*3+2] = base.b; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("size",     new THREE.BufferAttribute(sz,  1));
        geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
        geo.userData = {
            scatterTargets: scatter,
            finalTargets:   new Float32Array(count * 3),
            imageIndex:     new Uint8Array(count),
            ready: false,
        };
        const mat = new THREE.PointsMaterial({
            size: CFG.gallerySize, map: TEX.white, transparent: true, opacity: 1.0,
            vertexColors: true, blending: THREE.NormalBlending, depthWrite: false, sizeAttenuation: true,
        });
        groupGallery = new THREE.Points(geo, mat);
        groupGallery.visible = false;
        scene.add(groupGallery);
    }

    async function buildGalleryTargets() {
        if (!groupGallery || galleryBuilding) return;
        galleryBuilding = true;
        const count = CFG.galleryCount, geo = groupGallery.geometry;
        try {
            const nImg = getGalleryImageCount(), per = Math.floor(count / nImg);
            for (let i = 0; i < count; i++) geo.userData.imageIndex[i] = Math.min(nImg - 1, (i / per) | 0);
            const startX = -CFG.gallerySpacing * ((nImg - 1) / 2);
            const ft = geo.userData.finalTargets;
            for (let idx = 0; idx < nImg; idx++) {
                const b = idx * per, e = idx === nImg - 1 ? count : (idx + 1) * per, pc = e - b;
                const { targets: t, colors: c } = await imageToPointTargets(
                    heartFiles[idx], pc, startX + idx * CFG.gallerySpacing, CFG.galleryY);
                for (let j = 0; j < pc; j++) {
                    const p = b + j;
                    ft[p*3] = t[j*3]; ft[p*3+1] = t[j*3+1]; ft[p*3+2] = t[j*3+2];
                }
                const ca = geo.attributes.color.array;
                for (let j = 0; j < pc; j++) {
                    const p = b + j;
                    ca[p*3] = c[j*3]; ca[p*3+1] = c[j*3+1]; ca[p*3+2] = c[j*3+2];
                }
            }
            geo.userData.ready = galleryReady = true;
            geo.attributes.color.needsUpdate = true;
            console.log(`[Gallery Mobile] Build OK — ${count} particles`);
        } catch (e) {
            console.error("[Gallery Mobile] Build FAILED:", e); galleryReady = false;
        } finally { galleryBuilding = false; }
    }

    function startGallerySequence() {
        if (galleryTimer || gallerySequenceDone) return;
        gallerySequenceDone = false;
        galleryRevealCount = 1; msgMesh.visible = false; msgShown = false; msgWriteStart = -1;
        galleryTimer = setInterval(() => {
            const total = getGalleryImageCount();
            if (++galleryRevealCount >= total) {
                galleryRevealCount = total;
                gallerySequenceDone = true;
                clearInterval(galleryTimer); galleryTimer = null;
                setTimeout(() => { if (state === "GALLERY") { msgMesh.visible = true; msgShown = true; msgWriteStart = Date.now(); } }, 350);
                setTimeout(() => { if (state === "GALLERY" && subMsgMesh) subMsgMesh.visible = true; }, 3200);
            }
        }, CFG.revealStepMs);
    }

    function stopGallerySequence() {
        if (galleryTimer) { clearInterval(galleryTimer); galleryTimer = null; }
        galleryRevealCount = 0; gallerySequenceDone = false;
        if (msgMesh) msgMesh.visible = false;
        if (subMsgMesh) subMsgMesh.visible = false;
    }

    function updateGalleryPoints(time) {
        if (!groupGallery || !galleryReady) return;
        const geo = groupGallery.geometry;
        const pos = geo.attributes.position.array, sz = geo.attributes.size.array;
        const sc  = geo.userData.scatterTargets, ft = geo.userData.finalTargets;
        const idxArr = geo.userData.imageIndex;
        for (let i = 0; i < CFG.galleryCount; i++) {
            const rev = idxArr[i] < galleryRevealCount;
            pos[i*3]   += ((rev ? ft[i*3]   : sc[i*3])   - pos[i*3])   * 0.09;
            pos[i*3+1] += ((rev ? ft[i*3+1] : sc[i*3+1]) - pos[i*3+1]) * 0.09;
            pos[i*3+2] += ((rev ? ft[i*3+2] : sc[i*3+2]) - pos[i*3+2]) * 0.09;
            sz[i] = rev ? CFG.gallerySize : 0;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.size.needsUpdate     = true;
        if (geo.attributes.color) geo.attributes.color.needsUpdate = true;
    }

    // ── Animate ────────────────────────────────────────────────────
    function animate() {
        if (!renderer || !scene || !camera) return;
        requestAnimationFrame(animate);
        const time    = Date.now() * 0.001;
        const elapsed = started ? (Date.now() - startTime) : 0;
        const isGallery = state === "GALLERY";

        [groupSphere, groupInner, ...groupRings].forEach(g => g.visible = !isGallery);
        if (groupGallery) groupGallery.visible = isGallery;

        // ── GALLERY ──
        if (isGallery) {
            photoMeshes.forEach(m => { m.visible = false; m.scale.set(0, 0, 0); });
            if (!galleryReady && !galleryBuilding) buildGalleryTargets();
            if (galleryReady) { startGallerySequence(); updateGalleryPoints(time); }

            // Reveal chữ trái→phải như viết tay
            if (msgShown && msgWriteStart > 0 && mCtx && mTex) {
                const wp = Math.min((Date.now() - msgWriteStart) / 2500, 1.0);
                mCtx.clearRect(0, 0, 1024, 256);
                mCtx.save();
                mCtx.beginPath();
                mCtx.rect(msgTextX, 0, wp * msgTextW, 256);
                mCtx.clip();
                mCtx.font = '700 120px "Dancing Script", cursive';
                mCtx.textAlign = "center";
                mCtx.fillStyle = "#FFFFFF";
                mCtx.shadowColor = "#00AAFF"; mCtx.shadowBlur = 35;
                mCtx.fillText("Cảm ơn Ka Thy", 512, 128);
                mCtx.restore();
                mTex.needsUpdate = true;
            }

            renderer.render(scene, camera);
            return;
        }

        // ── SPHERE ──
        morph(groupSphere, "sphere");
        morph(groupInner,  "sphere");
        groupRings.forEach(r => morph(r, "sphere"));

        if (photoRevealed[0] && !sphereExpanded) sphereExpanded = true;
        if (sphereExpanded) {
            rotMult = rotMult + (0.3 - rotMult) * 0.018;
            camera.position.z = camera.position.z + (8 - camera.position.z) * 0.035;
            camera.fov = camera.fov + (90 - camera.fov) * 0.025;
            camera.updateProjectionMatrix();
        }

        groupSphere.rotation.y += 0.0030 * rotMult;
        groupInner.rotation.y  += 0.0055 * rotMult;
        groupRings.forEach(r => r.rotation.y += r.geometry.userData.speed * rotMult);

        const beat = 1 + Math.sin(time * 1.6) * 0.025;
        groupSphere.scale.setScalar(beat);
        groupInner.scale.setScalar(beat * 1.03);

        // Shimmer sphere
        const scol  = groupSphere.geometry.attributes.color.array;
        const sbase = groupSphere.geometry.userData.base;
        const sph   = groupSphere.geometry.userData.phase;
        for (let i = 0; i < CFG.sphereCount; i++) {
            const b = 0.55 + 0.45 * Math.sin(time * 5 + sph[i]);
            scol[i*3] = sbase[i*3]*b; scol[i*3+1] = sbase[i*3+1]*b; scol[i*3+2] = sbase[i*3+2]*b;
        }
        groupSphere.geometry.attributes.color.needsUpdate = true;

        // Shimmer rings
        groupRings.forEach(r => {
            const c = r.geometry.attributes.color.array;
            const p = r.geometry.userData.phase;
            const br = r.geometry.userData.baseR, bg = r.geometry.userData.baseG, bb = r.geometry.userData.baseB;
            const n = r.geometry.userData.sphere.length / 3;
            for (let i = 0; i < n; i++) {
                const bv = 0.5 + 0.5 * Math.sin(time * 8 + p[i]);
                c[i*3] = br*bv; c[i*3+1] = bg*bv; c[i*3+2] = bb*bv;
            }
            r.geometry.attributes.color.needsUpdate = true;
        });

        // ── Gyro: sphere rotate theo tilt điện thoại ──
        gyroGamma += (rawGamma - gyroGamma) * 0.07;
        gyroBeta  += (rawBeta  - gyroBeta)  * 0.07;
        if (gyroGroup && !finaleStarted) {
            const tiltZ = -(gyroGamma / 90) * 0.45;           // nghiêng trái/phải
            const tiltX =  (gyroBeta  - 90) / 90 * 0.40;     // nghiêng tiến/lùi
            gyroGroup.rotation.x += (tiltX - gyroGroup.rotation.x) * 0.07;
            gyroGroup.rotation.z += (tiltZ - gyroGroup.rotation.z) * 0.07;
        }

        // ── Photo timeline (grid photos only) ──
        photoDelays.forEach((delay, i) => {
            if (delay === Infinity) return;
            if (elapsed >= delay && !photoRevealed[i]) {
                photoRevealed[i] = true;
                const theta = Math.random() * Math.PI * 2;
                const phi   = Math.acos(2 * Math.random() - 1);
                const R     = CFG.sphereRadius;
                photoEmergePos[i] = new THREE.Vector3(
                    R * Math.sin(phi) * Math.cos(theta),
                    R * Math.cos(phi),
                    R * Math.sin(phi) * Math.sin(theta)
                );
                photoMeshes[i].position.copy(photoEmergePos[i]);
                photoMeshes[i].scale.set(0, 0, 0);
                photoMeshes[i].visible = true;
            }
        });

        // ── Animate ảnh / Finale ──
        if (finaleStarted) {
            const ft       = Date.now() - finalePhaseStart;
            const progress = Math.min(ft / 3500, 1.0);

            const origin = new THREE.Vector3(0, 0, 0);
            const tiny   = new THREE.Vector3(0.01, 0.01, 0.01);
            photoMeshes.forEach(m => { m.position.lerp(origin, 0.07); m.scale.lerp(tiny, 0.07); });

            camera.position.x += (0   - camera.position.x) * 0.04;
            camera.position.y += (0   - camera.position.y) * 0.04;
            camera.position.z += (130 - camera.position.z) * 0.025;
            camera.lookAt(0, 0, 0);
            camera.fov += (60 - camera.fov) * 0.02;
            camera.updateProjectionMatrix();

            const accelTarget = 1.0 + Math.pow(progress, 1.5) * 17.0;
            rotMult = Math.min(rotMult + (accelTarget - rotMult) * 0.05, 18.0);

            if (progress >= 1.0 && !galleryTriggered) {
                galleryTriggered = true;
                state = "GALLERY";
                msgMesh.visible = false; msgShown = false; msgWriteStart = -1;
                stopGallerySequence(); galleryRevealCount = 0;
                if (groupGallery?.geometry) {
                    const g = groupGallery.geometry;
                    const p = g.attributes.position.array;
                    const s = g.attributes.size.array;
                    for (let i = 0; i < CFG.galleryCount; i++) {
                        const phi   = Math.acos(2 * Math.random() - 1);
                        const theta = Math.random() * Math.PI * 2;
                        const R     = CFG.sphereRadius * (0.8 + Math.random() * 0.5);
                        p[i*3]   = R * Math.sin(phi) * Math.cos(theta);
                        p[i*3+1] = R * Math.cos(phi);
                        p[i*3+2] = R * Math.sin(phi) * Math.sin(theta);
                        s[i] = CFG.gallerySize;
                    }
                    g.attributes.position.needsUpdate = true;
                    g.attributes.size.needsUpdate = true;
                }
            }
        } else if (cloudStarted) {
            // ── CLOUD PHASE: ký ức nổi trôi ──
            const ct = Date.now() - cloudStartTime;
            const CLOUD_DURATION = 25000; // 25s (shorter for mobile)

            const caption = document.getElementById('cloud-caption');
            if (caption) {
                if (ct >= 3000 && ct < CLOUD_DURATION - 4000) caption.classList.add('show');
                else caption.classList.remove('show');
            }

            const ORBIT_R = 125;
            const orbitAngle = ct * 0.001 * 0.055;

            const tx = Math.sin(orbitAngle) * ORBIT_R;
            const tz = Math.cos(orbitAngle) * ORBIT_R;
            const ty = Math.sin(ct * 0.001 * 0.018) * 22;
            camera.position.x += (tx - camera.position.x) * 0.02;
            camera.position.y += (ty - camera.position.y) * 0.02;
            camera.position.z += (tz - camera.position.z) * 0.02;
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            camera.fov += (60 - camera.fov) * 0.02;
            camera.updateProjectionMatrix();
            rotMult += (1.0 - rotMult) * 0.02;

            for (let i = MAX_PHOTOS; i < photoMeshes.length; i++) {
                const ci = i - MAX_PHOTOS;
                if (ct >= ci * 1400 && !photoRevealed[i]) {
                    photoRevealed[i]    = true;
                    photoRevealTimes[i] = Date.now();
                    const target = photoPositions[i];
                    const dir    = target.clone().normalize();
                    photoEmergePos[i] = dir.multiplyScalar(CFG.sphereRadius);
                    photoMeshes[i].position.copy(photoEmergePos[i]);
                    photoMeshes[i].scale.set(0.05, 0.05, 0.05);
                    photoMeshes[i].visible = true;
                }
            }

            const targetScaleC = new THREE.Vector3(2.4, 2.4, 2.4);
            photoMeshes.forEach((mesh, i) => {
                if (!photoRevealed[i]) return;
                const base   = photoPositions[i];
                const floatY = Math.sin(time * 0.4 + i * 1.1) * 1.5;
                let lerpF;
                if (i >= MAX_PHOTOS && photoRevealTimes[i]) {
                    const age = (Date.now() - photoRevealTimes[i]) * 0.001;
                    lerpF = Math.max(0.018, 0.13 * Math.exp(-age * 1.6));
                } else {
                    lerpF = 0.022;
                }
                mesh.position.lerp(new THREE.Vector3(base.x, base.y + floatY, base.z), lerpF);
                mesh.scale.lerp(targetScaleC, lerpF * 0.85);
                mesh.lookAt(camera.position);
            });

            if (ct >= CLOUD_DURATION) {
                finaleStarted    = true;
                finalePhaseStart = Date.now();
            }
        } else {
            const targetScale = new THREE.Vector3(2.4, 2.4, 2.4);
            photoMeshes.forEach((mesh, i) => {
                if (!photoRevealed[i]) return;
                const base   = photoPositions[i];
                const floatY = Math.sin(time * 0.5 + i * 1.1) * 1.2;
                mesh.position.lerp(new THREE.Vector3(base.x, base.y + floatY, base.z), 0.03);
                mesh.scale.lerp(targetScale, 0.03);
                mesh.lookAt(camera.position);
            });
            const allGridOut    = photoRevealed.slice(0, MAX_PHOTOS).every(r => r);
            const lastGridDelay = photoDelays[MAX_PHOTOS - 1] || 0;
            if (allGridOut && elapsed >= lastGridDelay + 2000 && !cloudStarted) {
                cloudStarted   = true;
                cloudStartTime = Date.now();
                for (let i = 0; i < MAX_PHOTOS; i++) {
                    const phi   = Math.acos(2 * Math.random() - 1);
                    const theta = Math.random() * Math.PI * 2;
                    const r     = 90 + Math.random() * 40;
                    photoPositions[i] = new THREE.Vector3(
                        r * Math.sin(phi) * Math.cos(theta),
                        r * Math.cos(phi) * 0.65,
                        r * Math.sin(phi) * Math.sin(theta)
                    );
                }
            }
        }

        if (elapsed >= galleryDelay && !galleryTriggered) {
            galleryTriggered = true;
            state = "GALLERY";
            msgMesh.visible = false; msgShown = false; msgWriteStart = -1;
            stopGallerySequence(); galleryRevealCount = 0;
            if (groupGallery?.geometry) {
                const g  = groupGallery.geometry;
                const sc = g.userData.scatterTargets;
                const p  = g.attributes.position.array, s = g.attributes.size.array;
                for (let k = 0; k < p.length; k++) p[k] = sc[k];
                for (let k = 0; k < s.length; k++) s[k] = 0;
                g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true;
            }
        }

        renderer.render(scene, camera);
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(photoScene, camera);
        renderer.autoClear = true;
    }

    // ── Music (can start early, guarded against double-init) ──────
    function startMusic() {
        if (bgMusic) return;
        bgMusic = new Audio(MUSIC_URL); bgMusic.loop = true; bgMusic.volume = 1.0;
        bgMusic.muted = true; bgMusic.currentTime = 59;
        bgMusic.play().then(() => { bgMusic.muted = false; bgMusic.volume = 1.0; }).catch(() => {
            document.addEventListener('click', () => { bgMusic.muted = false; bgMusic.play().catch(() => {}); }, { once: true });
        });
    }
    window.addEventListener('music-early', startMusic);

    // ── Start ──────────────────────────────────────────────────────
    async function startSystem() {
        if (started) return; started = true;

        const btn = document.getElementById("btnStart");
        if (btn) btn.style.display = "none";

        startMusic();

        let photos = [];
        try {
            const res = await fetch('photos.json');
            photos = await res.json();
        } catch (_) {
            photos = ["./image1.jpeg","./image2.jpeg","./image3.jpeg","./image4.jpeg","./image5.jpeg"];
        }
        shuffle(photos);
        photos = photos.slice(0, MAX_PHOTOS + CLOUD_COUNT); // 32 photos total

        photoFiles     = photos;
        photoTextures  = photos.map(url => loader.load(url));
        photoPositions = computePhotoPositions(photos.length);
        photoRevealed  = Array(photos.length).fill(false);
        photoEmergePos = Array(photos.length).fill(null);

        let t = 3000;
        photoDelays = photos.map((_, i) => {
            if (i >= MAX_PHOTOS) return Infinity;
            const d = t;
            t += 2000 + Math.random() * 1000;
            return d;
        });
        galleryDelay = 999999;

        startTime = Date.now();
        init3D();
        window.addEventListener("resize", resizeToContainer);
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                resizeToContainer();
                // Rebuild gallery targets with updated camera aspect after rotation
                if (galleryReady || state === "GALLERY") {
                    galleryReady = false;
                    galleryBuilding = false;
                    buildGalleryTargets();
                }
            }, 300);
        });

        // ── Gyroscope (request permission on first touch for iOS) ──
        const onGyro = e => { rawGamma = e.gamma || 0; rawBeta = e.beta || 0; };
        let gyroActive = false;
        const enableGyro = () => {
            if (gyroActive) return; gyroActive = true;
            if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(p => { if (p === 'granted') window.addEventListener('deviceorientation', onGyro); })
                    .catch(() => {});
            } else {
                window.addEventListener('deviceorientation', onGyro);
            }
        };

        // ── Tap sphere → morph thành final.png ──
        let tapStart = null;
        const cont = document.getElementById('canvas-container');
        if (cont) {
            cont.addEventListener('touchstart', e => {
                enableGyro();
                if (e.touches.length === 1)
                    tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
            }, { passive: true });
            cont.addEventListener('touchend', e => {
                if (!tapStart || state !== 'SPHERE' || finaleStarted || cloudStarted) { tapStart = null; return; }
                const dx = e.changedTouches[0].clientX - tapStart.x;
                const dy = e.changedTouches[0].clientY - tapStart.y;
                if (Math.hypot(dx, dy) < 15 && Date.now() - tapStart.t < 350) {
                    finaleStarted = true; finalePhaseStart = Date.now();
                }
                tapStart = null;
            }, { passive: true });
        }
    }

    window.addEventListener("magic-start", startSystem, { once: true });
})();
