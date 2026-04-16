import RAPIER from "@dimforge/rapier2d-compat";
const SCALE = 220;
const worldWidth = window.innerWidth / SCALE;
const worldHeight = window.innerHeight / SCALE;
const toPhysX = (x) => (x - window.innerWidth / 2) / SCALE;
const toPhysY = (y) => -(y - window.innerHeight / 2) / SCALE;
const toPixX = (x) => x * SCALE + window.innerWidth / 2;
const toPixY = (y) => -y * SCALE + window.innerHeight / 2;

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
	const box = document.getElementById("box");
	const box2 = document.getElementById("box2");
	const stone1 = document.querySelector(".stone1");
	const stone2 = document.querySelector(".stone2");

	// ===== 物理ワールド =====
	await RAPIER.init({
		noDefaultInstance: false,
		wasmUrl: "/rapier_wasm2d_bg.wasm",
	});
	// gravity = 物体がどれだけ速く下に加速するかを決める値
	const gravity = { x: 0.0, y: -10 };
	const world = new RAPIER.World(gravity);
	world.integrationParameters.numSolverIterations = 30;
	world.integrationParameters.numAdditionalFrictionIterations = 12;

	// ===== 初期位置 =====
	const rect = box.getBoundingClientRect();
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;
	const rect2 = box2.getBoundingClientRect();
	const cx2 = rect2.left + rect2.width / 2;
	const cy2 = rect2.top + rect2.height / 2;
	const path = stone1.querySelector("path");
	const vb = stone1.viewBox.baseVal;
	const path2 = stone2.querySelector("path");
	const vb2 = stone2.viewBox.baseVal;

	const rect3 = stone1.getBoundingClientRect();
	const cx3 = window.innerWidth / 2;
	const cy3 = window.innerHeight / 2;

	const rawVerts = pathToVertices(path, 2, 120);
	const scaleX3 = rect3.width / vb.width;
	const scaleY3 = rect3.height / vb.height;
	const verts = rawVerts.map(([x, y]) => [((x - vb.x - vb.width / 2) * scaleX3) / SCALE, -(((y - vb.y - vb.height / 2) * scaleY3) / SCALE)]);

	const rect4 = stone2.getBoundingClientRect();
	const cx4 = window.innerWidth / 2;
	const cy4 = window.innerHeight / 2;

	const rawVerts2 = pathToVertices(path2, 2, 120);
	const scaleX4 = rect4.width / vb2.width;
	const scaleY4 = rect4.height / vb2.height;
	const verts4 = rawVerts2.map(([x, y]) => [((x - vb2.x - vb2.width / 2) * scaleX4) / SCALE, -(((y - vb2.y - vb2.height / 2) * scaleY4) / SCALE)]);

	// ===== 剛体 =====
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx), toPhysY(cy)).setLinearDamping(12).setAngularDamping(12));

	const body2 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx2), toPhysY(cy2)).setLinearDamping(12).setAngularDamping(12));

	const body3 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx3), toPhysY(cy3)).setLinearDamping(12).setAngularDamping(12));

	const body4 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx4), toPhysY(cy4)).setLinearDamping(12).setAngularDamping(12));

	// ===== コライダー =====
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect.width / 2 / SCALE, rect.height / 2 / SCALE), body).setRestitution(0);
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect2.width / 2 / SCALE, rect2.height / 2 / SCALE), body2).setRestitution(0);
	// stone1
	const cleaned = clean(verts);
	const flat = cleaned.flat();

	const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(flat));

	if (hull) {
		hull.setDensity(1);
		world.createCollider(hull, body3).setRestitution(0);
	}

	// stone2
	const cleaned2 = clean(verts4);
	const flat2 = cleaned2.flat();

	const hull2 = RAPIER.ColliderDesc.convexHull(new Float32Array(flat2));

	if (hull2) {
		hull2.setDensity(1);
		world.createCollider(hull2, body4).setRestitution(0.0);
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
	let dragging = false;
	let dragging2 = false;
	let dragging3 = false;
	let dragging4 = false;
	// --- マウス ---
	box.addEventListener("mousedown", (e) => {
		dragging = true;
		body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	box2.addEventListener("mousedown", (e) => {
		dragging2 = true;
		body2.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	stone1.addEventListener("mousedown", (e) => {
		dragging3 = true;
		body3.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	stone2.addEventListener("mousedown", (e) => {
		dragging4 = true;
		body4.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});

	// --- タッチ ---
	box.addEventListener(
		"touchstart",
		(e) => {
			dragging = true;
			body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			e.preventDefault();
		},
		{ passive: false },
	);
	box2.addEventListener(
		"touchstart",
		(e) => {
			dragging2 = true;
			body2.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			e.preventDefault();
		},
		{ passive: false },
	);
	stone1.addEventListener(
		"touchstart",
		(e) => {
			dragging3 = true;
			body3.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			e.preventDefault();
		},
		{ passive: false },
	);
	stone2.addEventListener(
		"touchstart",
		(e) => {
			dragging4 = true;
			body4.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			e.preventDefault();
		},
		{ passive: false },
	);

	window.addEventListener("mousemove", (e) => {
		const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

		const bodies = [body, body2, body3, body4];
		const rects = [box.getBoundingClientRect(), box2.getBoundingClientRect(), stone1.getBoundingClientRect(), stone2.getBoundingClientRect()];
		const drags = [dragging, dragging2, dragging3, dragging4];

		for (let i = 0; i < bodies.length; i++) {
			if (!drags[i]) continue;
			const w = rects[i].width;
			const h = rects[i].height;
			const x = clamp(e.clientX, w / 2, window.innerWidth - w / 2);
			const y = clamp(e.clientY, h / 2, window.innerHeight - h / 2);
			bodies[i].setNextKinematicTranslation({
				x: toPhysX(x),
				y: toPhysY(y),
			});
		}
	});

	window.addEventListener(
		"touchmove",
		(e) => {
			const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
			if (e.touches.length === 0) return;
			const touch = e.touches[0];

			const bodies = [body, body2, body3, body4];
			const rects = [box.getBoundingClientRect(), box2.getBoundingClientRect(), stone1.getBoundingClientRect(), stone2.getBoundingClientRect()];
			const drags = [dragging, dragging2, dragging3, dragging4];

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
		if (!dragging && !dragging2 && !dragging3 && !dragging4) return;

		if (dragging) {
			dragging = false;
			body.setLinvel({ x: 0, y: 0 }, true);
			body.setAngvel(0, true);
			requestAnimationFrame(() => {
				body.setBodyType(RAPIER.RigidBodyType.Dynamic);
			});
		}
		if (dragging2) {
			dragging2 = false;
			body2.setLinvel({ x: 0, y: 0 }, true);
			body2.setAngvel(0, true);
			requestAnimationFrame(() => {
				body2.setBodyType(RAPIER.RigidBodyType.Dynamic);
			});
		}
		if (dragging3) {
			dragging3 = false;
			body3.setLinvel({ x: 0, y: 0 }, true);
			body3.setAngvel(0, true);
			requestAnimationFrame(() => {
				body3.setBodyType(RAPIER.RigidBodyType.Dynamic);
			});
		}
		if (dragging4) {
			dragging4 = false;
			body4.setLinvel({ x: 0, y: 0 }, true);
			body4.setAngvel(0, true);
			requestAnimationFrame(() => {
				body4.setBodyType(RAPIER.RigidBodyType.Dynamic);
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
		const maxY = toPhysY(0); // 画面上端

		const bodies = [body, body2, body3, body4];
		const rects = [rect, rect2, rect3, rect4];
		const doms = [box, box2, stone1, stone2];

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
			// 画面上端は反射させない
			// if (y > maxY) {
			// 	y = maxY;
			// 	fixed = true;
			// }

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
