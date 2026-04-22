import RAPIER from "@dimforge/rapier2d-compat";
const SCALE = 80;
let worldWidth, worldHeight;
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

// グローバル変数として保持
let world, bodies, colliders, doms, rects, centers, paths, vbs, vertsArr;
let floor, floorCollider, leftWall, leftWallCollider, rightWall, rightWallCollider;

// 物理ワールド初期化を関数化
async function initWorld() {
	// DOM取得
	doms = [document.getElementById("box"), document.getElementById("box2"), document.querySelector(".stone1"), document.querySelector(".stone2")];
	rects = doms.map((dom) => dom.getBoundingClientRect());
	centers = rects.map((rect) => ({
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	}));
	paths = [doms[2].querySelector("path"), doms[3].querySelector("path")];
	vbs = [doms[2].viewBox.baseVal, doms[3].viewBox.baseVal];
	vertsArr = paths.map((path, i) => {
		const rawVerts = pathToVertices(path, 2, 120);
		const scaleX = rects[i + 2].width / vbs[i].width;
		const scaleY = rects[i + 2].height / vbs[i].height;
		return rawVerts.map(([x, y]) => [((x - vbs[i].x - vbs[i].width / 2) * scaleX) / SCALE, -(((y - vbs[i].y - vbs[i].height / 2) * scaleY) / SCALE)]);
	});

	// 物理ワールド
	const gravity = { x: 0.0, y: -45 };
	world = new RAPIER.World(gravity);
	world.integrationParameters.numSolverIterations = 20;
	world.integrationParameters.contact_natural_frequency = 100;
	world.integrationParameters.normalizedAllowedLinearError = 0.000001;
	world.integrationParameters.normalizedPredictionDistance = 0.1;

	const linearDamping = 0.5;
	const angularDamping = 1;
	bodies = [
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

	// コライダー
	colliders = [];
	colliders[0] = world.createCollider(RAPIER.ColliderDesc.cuboid(rects[0].width / 2 / SCALE, rects[0].height / 2 / SCALE), bodies[0]);
	colliders[0].setRestitution(0);
	colliders[1] = world.createCollider(RAPIER.ColliderDesc.cuboid(rects[1].width / 2 / SCALE, rects[1].height / 2 / SCALE), bodies[1]);
	colliders[1].setRestitution(0);
	for (let i = 0; i < 2; i++) {
		const cleaned = clean(vertsArr[i]);
		const flat = cleaned.flat();
		const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(flat));
		if (hull) {
			hull.setDensity(3);
			colliders[i + 2] = world.createCollider(hull, bodies[i + 2]);
			colliders[i + 2].setRestitution(0.0);
		}
	}

	// 床・壁
	worldWidth = window.innerWidth / SCALE;
	worldHeight = window.innerHeight / SCALE;
	const wallThickness = 1;
	floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -worldHeight / 2));
	floorCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(worldWidth, 0.2), floor);
	floorCollider.setRestitution(0.0);

	leftWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-worldWidth / 2 - wallThickness, 0));
	leftWallCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight), leftWall);
	leftWallCollider.setRestitution(0.0);

	rightWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(worldWidth / 2 + wallThickness, 0));
	rightWallCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight), rightWall);
	rightWallCollider.setRestitution(0.0);
}

// 初期化
(async () => {
	await RAPIER.init({});
	await initWorld();

	// ===== ドラッグ =====
	let drags = [false, false, false, false];
	doms.forEach((dom, i) => {
		dom.addEventListener("mousedown", (e) => {
			drags[i] = true;
			bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			setGrab(bodies[i], i, e);
		});
	});
	doms.forEach((dom, i) => {
		dom.addEventListener("touchstart", (e) => {
			drags[i] = true;
			bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			e.preventDefault();
		});
	});

	// 0.01は減り込み具合の調整値。小さいほど減り込みが少なくなり、ドラッグの追従が良くなるが、数値が小さすぎると物体が引っかかりやすくなる
	// 上に物体が載っていて動かせるかどうかはこの値次第。衝突判定の頻度が上がるため、パフォーマンスにも影響する
	const characterController = world.createCharacterController(0.001);

	window.addEventListener("mousemove", (e) => {
		const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
		for (let i = 0; i < bodies.length; i++) {
			if (!drags[i]) continue;
			const w = rects[i].width;
			const h = rects[i].height;
			const x = clamp(e.clientX, w / 2, window.innerWidth - w / 2);
			const y = clamp(e.clientY, h / 2, window.innerHeight - h / 2);

			// 現在位置を取得
			const current = bodies[i].translation();

			// 「行きたい移動量（delta）」を作る
			const delta = {
				x: toPhysX(x) + offsets[i].x - current.x,
				y: toPhysY(y) + offsets[i].y - current.y,
			};

			// deltaは壁などを無視した移動
			characterController.computeColliderMovement(colliders[i], delta);
			// 衝突を考慮した安全な移動
			const corrected = characterController.computedMovement();
			// 実際に移動する
			bodies[i].setNextKinematicTranslation({
				x: current.x + corrected.x,
				y: current.y + corrected.y,
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

				// 現在位置
				const current = bodies[i].translation();

				// 行きたい移動量（delta）
				const delta = {
					x: toPhysX(x) + offsets[i].x - current.x,
					y: toPhysY(y) + offsets[i].y - current.y,
				};

				// 衝突考慮
				characterController.computeColliderMovement(colliders[i], delta);

				const corrected = characterController.computedMovement();

				// 安全な移動
				bodies[i].setNextKinematicTranslation({
					x: current.x + corrected.x,
					y: current.y + corrected.y,
				});
			}

			e.preventDefault();
		},
		{ passive: false },
	);

	function endDrag() {
		if (!drags.some(Boolean)) return;
		for (let i = 0; i < drags.length; i++) {
			if (!drags[i]) continue;
			drags[i] = false;
			let linvel = bodies[i].linvel();
			let angvel = bodies[i].angvel();
			bodies[i].setLinvel(linvel, true);
			bodies[i].setAngvel(angvel, true);
			requestAnimationFrame(() => {
				// 重力・力・衝突の影響を受けて自然に動くように、ドラッグ終了後にダイナミックに切り替える
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

	// ===== リサイズ対応 =====
	let resizeTimer;
	window.addEventListener("resize", () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (!window.matchMedia("(pointer: coarse)").matches) {
				location.reload();
			} else {
				initWorld();
			}
		}, 200);
	});

	// ===== ループ =====

	function loop() {
		world.step();

		const minX = toPhysX(0);
		const maxX = toPhysX(window.innerWidth);
		const minY = toPhysY(window.innerHeight);

		for (let i = 0; i < bodies.length; i++) {
			const b = bodies[i];
			const v = b.linvel();
			// 上方向移動距離調整
			const vy = v.y > 0 ? v.y * 0.1 : v.y;
			// 横方向移動距離調整
			const vx = v.x * 0.7;
			b.setLinvel({ x: vx, y: vy }, true);
			// 回転減衰
			b.setAngvel(b.angvel() * 0.2, true);
		}

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
