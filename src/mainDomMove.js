import RAPIER from "@dimforge/rapier2d-compat";
const SCALE = 80;
const worldWidth = window.innerWidth / SCALE;
const worldHeight = window.innerHeight / SCALE;
const toPhysX = (x) => (x - window.innerWidth / 2) / SCALE;
const toPhysY = (y) => -(y - window.innerHeight / 2) / SCALE;
const toPixX = (x) => x * SCALE + window.innerWidth / 2;
const toPixY = (y) => -y * SCALE + window.innerHeight / 2;

// 物体のどこを掴んでもOKなようにするための座標保存用配列
const offsets = [
	{ x: 0, y: 0 }, // body
	{ x: 0, y: 0 }, // body2
	{ x: 0, y: 0 }, // body3
	{ x: 0, y: 0 }, // body4
];

function setGrab(body, index, e) {
	const pos = body.translation();

	const mouseX = toPhysX(e.clientX);
	const mouseY = toPhysY(e.clientY);

	offsets[index] = {
		x: pos.x - mouseX,
		y: pos.y - mouseY,
	};
}

// 物体が飛びすぎないように速度と距離を制限する関数
function clampMagnitude(vec, max) {
	const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
	if (mag > max) {
		const scale = max / mag;
		return { x: vec.x * scale, y: vec.y * scale };
	}
	return vec;
}

// SVGパスをサンプリングして頂点配列を生成
function pathToVertices(pathEl, minStep = 6, maxPoints = 60) {
	const total = pathEl.getTotalLength();
	const step = Math.max(minStep, total / maxPoints);
	const verts = [];

	for (let i = 0; i <= total; i += step) {
		const pt = pathEl.getPointAtLength(i);
		verts.push([pt.x, pt.y]);
	}

	return verts;
}

// SVG
function clean(pts) {
	const out = [];
	const EPS = 0.001;

	for (const p of pts) {
		const x = p[0],
			y = p[1];
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

		const last = out[out.length - 1];
		if (last) {
			const dx = last[0] - x;
			const dy = last[1] - y;
			if (dx * dx + dy * dy < EPS * EPS) continue;
		}

		out.push([x, y]);
	}

	return out;
}

(async () => {
	const doms = [document.getElementById("box"), document.getElementById("box2"), document.querySelector(".stone1"), document.querySelector(".stone2")];

	// ===== 物理ワールド =====
	await RAPIER.init({
		noDefaultInstance: false,
		wasmUrl: "/rapier_wasm2d_bg.wasm",
	});
	// gravity = 物体がどれだけ速く下に加速するかを決める値
	const gravity = { x: 0.0, y: -80 };
	const world = new RAPIER.World(gravity);

	// 物体の減り込みを減らすために、ソルバーの反復回数を増やす
	world.integrationParameters.numSolverIterations = 8;
	world.integrationParameters.numAdditionalFrictionIterations = 15;
	// めりこみ許容量
	world.integrationParameters.allowedLinearError = 0.0001;
	// 衝突を減らすために柔らかくする
	world.integrationParameters.erp = 0.6;

	// ===== 初期位置・形状データ =====
	const rects = doms.map((dom) => dom.getBoundingClientRect());
	const centers = rects.map((rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));

	// stone1, stone2用のパス・頂点データ
	const paths = [doms[2].querySelector("path"), doms[3].querySelector("path")];
	const vbs = [doms[2].viewBox.baseVal, doms[3].viewBox.baseVal];
	const vertsArr = paths.map((path, i) => {
		const rawVerts = pathToVertices(path, 2, 120);
		const scaleX = rects[i + 2].width / vbs[i].width;
		const scaleY = rects[i + 2].height / vbs[i].height;
		return rawVerts.map(([x, y]) => [((x - vbs[i].x - vbs[i].width / 2) * scaleX) / SCALE, -(((y - vbs[i].y - vbs[i].height / 2) * scaleY) / SCALE)]);
	});

	// ===== 剛体 =====
	const linearDamping = 0.5;
	const angularDamping = 3;
	const bodies = [
		world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(centers[0].x), toPhysY(centers[0].y)).setLinearDamping(linearDamping).setAngularDamping(angularDamping)),
		world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(centers[1].x), toPhysY(centers[1].y)).setLinearDamping(linearDamping).setAngularDamping(angularDamping)),
		world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(toPhysX(window.innerWidth / 2), toPhysY(window.innerHeight / 2))
				.setLinearDamping(linearDamping)
				.setAngularDamping(angularDamping),
		),
		world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(toPhysX(window.innerWidth / 2), toPhysY(window.innerHeight / 2))
				.setLinearDamping(linearDamping)
				.setAngularDamping(angularDamping),
		),
	];

	// ===== コライダー =====
	// box, box2
	world.createCollider(RAPIER.ColliderDesc.cuboid(rects[0].width / 2 / SCALE, rects[0].height / 2 / SCALE), bodies[0]).setRestitution(0);
	world.createCollider(RAPIER.ColliderDesc.cuboid(rects[1].width / 2 / SCALE, rects[1].height / 2 / SCALE), bodies[1]).setRestitution(0);
	// stone1, stone2
	for (let i = 0; i < 2; i++) {
		const cleaned = clean(vertsArr[i]);
		const flat = cleaned.flat();
		const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(flat));
		if (hull) {
			hull.setDensity(3);
			world.createCollider(hull, bodies[i + 2]).setRestitution(0.0);
		}
	}
	// ===== 床 =====
	const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -worldHeight / 2));
	const floorCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(worldWidth, 0.2), floor);
	floorCollider.setRestitution(0.0);

	// ===== 左右の壁 =====
	const wallThickness = 0.2; // 薄い壁

	const leftWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-worldWidth / 2 - wallThickness, 0));
	const leftWallCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight), leftWall);
	leftWallCollider.setRestitution(0.0);

	const rightWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(worldWidth / 2 + wallThickness, 0));
	const rightWallCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight), rightWall);
	rightWallCollider.setRestitution(0.0);

	// ===== ドラッグ =====
	let drags = [false, false, false, false];
	// --- マウス ---
	doms.forEach((dom, i) => {
		dom.addEventListener("mousedown", (e) => {
			drags[i] = true;
			bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			setGrab(bodies[i], i, e);
		});
	});
	// --- タッチ ---
	doms.forEach((dom, i) => {
		dom.addEventListener(
			"touchstart",
			(e) => {
				drags[i] = true;
				bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
				e.preventDefault();
			},
			{ passive: false },
		);
	});

	window.addEventListener("mousemove", (e) => {
		const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
		for (let i = 0; i < bodies.length; i++) {
			if (!drags[i]) continue;
			const w = rects[i].width;
			const h = rects[i].height;
			const x = clamp(e.clientX, w / 2, window.innerWidth - w / 2);
			const y = clamp(e.clientY, h / 2, window.innerHeight - h / 2);
			bodies[i].setNextKinematicTranslation({
				x: toPhysX(x) + offsets[i].x,
				y: toPhysY(y) + offsets[i].y,
			});
		}
	});

	window.addEventListener(
		"touchmove",
		(e) => {
			const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
			if (e.touches.length === 0) return;
			const touch = e.touches[0];
			for (let i = 0; i < bodies.length; i++) {
				if (!drags[i]) continue;
				const w = rects[i].width;
				const h = rects[i].height;
				const x = clamp(touch.clientX, w / 2, window.innerWidth - w / 2);
				const y = clamp(touch.clientY, h / 2, window.innerHeight - h / 2);
				bodies[i].setNextKinematicTranslation({
					x: toPhysX(x),
					y: toPhysY(y),
				});
			}
			e.preventDefault();
		},
		{ passive: false },
	);

	function endDrag() {
		if (!drags.some(Boolean)) return;
		const MAX_LINVEL = 1;
		const MAX_ANGVEL = 5;
		for (let i = 0; i < drags.length; i++) {
			if (!drags[i]) continue;
			drags[i] = false;
			let linvel = clampMagnitude(bodies[i].linvel(), MAX_LINVEL);
			let angvel = Math.max(Math.min(bodies[i].angvel(), MAX_ANGVEL), -MAX_ANGVEL);
			bodies[i].setLinvel(linvel, true);
			bodies[i].setAngvel(angvel, true);
			requestAnimationFrame(() => {
				bodies[i].setBodyType(RAPIER.RigidBodyType.Dynamic);
			});
		}
	}

	window.addEventListener("mouseup", endDrag);
	window.addEventListener(
		"touchend",
		(e) => {
			endDrag();
			e.preventDefault();
		},
		{ passive: false },
	);

	// ===== ループ =====
	function loop() {
		world.step();

		const minX = toPhysX(0);
		const maxX = toPhysX(window.innerWidth);
		const minY = toPhysY(window.innerHeight); // 画面下端
		// const maxY = toPhysY(0); // 画面上端

		for (let i = 0; i < bodies.length; i++) {
			const b = bodies[i];
			const v = b.linvel();

			// 上方向を殺す
			const vy = v.y > 0 ? 0 : v.y;

			// 横減衰
			const vx = v.x * 0.5;

			// ★ まとめて1回だけセット
			b.setLinvel({ x: vx, y: vy }, true);

			// 回転減衰
			b.setAngvel(b.angvel() * 0.2, true);
		}

		// 画面外制限
		for (let i = 0; i < bodies.length; i++) {
			let pos = bodies[i].translation();
			let fixed = false;
			let x = pos.x;
			let y = pos.y;
			if (x < minX) {
				x = minX;
				fixed = true;
			}
			if (x > maxX) {
				x = maxX;
				fixed = true;
			}
			if (y < minY) {
				y = minY;
				fixed = true;
			}
			if (fixed) {
				bodies[i].setLinvel({ x: 0, y: 0 }, true);
				bodies[i].setAngvel(0, true);
				bodies[i].setTranslation({ x, y }, true);
			}
		}

		// 描画更新
		for (let i = 0; i < bodies.length; i++) {
			const pos = bodies[i].translation();
			const angle = bodies[i].rotation();
			const x = toPixX(pos.x);
			const y = toPixY(pos.y);
			doms[i].style.transform = `translate(${x - rects[i].width / 2}px, ${y - rects[i].height / 2}px) rotate(${-angle}rad)`;
		}

		requestAnimationFrame(loop);
	}
	loop();
})();
