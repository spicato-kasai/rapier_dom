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

// 初期値設定
function getCSSPosPx(dom) {
	const style = getComputedStyle(dom);

	const rawX = style.getPropertyValue("--x").trim();
	const rawY = style.getPropertyValue("--y").trim();

	return {
		x: cssValueToPx(rawX, "x"),
		y: cssValueToPx(rawY, "y"),
	};
}
// vwとvhをpxに変換
function cssValueToPx(value, axis = "x") {
	if (value.includes("vw")) {
		return (parseFloat(value) / 100) * window.innerWidth;
	}
	if (value.includes("vh")) {
		return (parseFloat(value) / 100) * window.innerHeight;
	}
	if (value.includes("px")) {
		return parseFloat(value);
	}
	return parseFloat(value); // fallback
}

// 箱の外は重力をなくすための関数
function getCalRect() {
	return document.querySelector(".calender").getBoundingClientRect();
}

// グローバル変数として保持
let world, bodies, colliders, doms, rects, centers, paths, vbs, vertsArr;
let floor, floorCollider, leftWall, leftWallCollider, rightWall, rightWallCollider;
let innerOffsetLeft = 0;
let innerOffsetRight = 0;

// クリア要素取得
const clearEl = document.querySelector(".clear");

// 箱のサイズが変わる可能性があるため、常に最新のサイズを取得する関数
function updateOffsets() {
	const leftDom = document.querySelector(".side-left");
	const rightDom = document.querySelector(".side-right");

	innerOffsetLeft = leftDom.getBoundingClientRect().width;
	innerOffsetRight = rightDom.getBoundingClientRect().width;
}

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

	// 初期位置設定

	bodies = doms.map((dom, i) => {
		const pos = getCSSPosPx(dom);

		return world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(pos.x), toPhysY(pos.y)).setLinearDamping(linearDamping).setAngularDamping(angularDamping));
	});

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

	// 石を入れる箱（カレンダーに該当する）
	function createWallFromDom(el) {
		const rect = el.getBoundingClientRect();

		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(toPhysX(centerX), toPhysY(centerY)));

		const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(rect.width / 2 / SCALE, rect.height / 2 / SCALE), body);

		collider.setRestitution(0.0);

		return { body, collider };
	}
	const floorDom = document.querySelector(".floor");
	const leftDom = document.querySelector(".side-left");
	const rightDom = document.querySelector(".side-right");

	const calFloor = createWallFromDom(floorDom);
	const calLeft = createWallFromDom(leftDom);
	const calRight = createWallFromDom(rightDom);

	// DOMの位置セット
	for (let i = 0; i < bodies.length; i++) {
		const pos = bodies[i].translation();
		const x = toPixX(pos.x);
		const y = toPixY(pos.y);

		doms[i].style.transform = `translate(${x - rects[i].width / 2}px, ${y - rects[i].height / 2}px)`;
	}
}

// 初期化
(async () => {
	await RAPIER.init({});
	await initWorld();

	// 箱のサイズ取得
	updateOffsets();

	// 箱の判定ようのマージン
	const enterMargin = 50;
	const exitMargin = 50;
	const insideStates = [false, false, false, false];

	// ===== ドラッグ =====
	let drags = [false, false, false, false];
	doms.forEach((dom, i) => {
		dom.addEventListener("mousedown", (e) => {
			drags[i] = true;
			bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			colliders[i].setSensor(!mouseInBox);
			setGrab(bodies[i], i, e);
		});
	});
	doms.forEach((dom, i) => {
		dom.addEventListener("touchstart", (e) => {
			drags[i] = true;
			bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
			colliders[i].setSensor(!mouseInBox);
			e.preventDefault();
		});
	});

	// 0.01は減り込み具合の調整値。小さいほど減り込みが少なくなり、ドラッグの追従が良くなるが、数値が小さすぎると物体が引っかかりやすくなる
	// 上に物体が載っていて動かせるかどうかはこの値次第。衝突判定の頻度が上がるため、パフォーマンスにも影響する
	const characterController = world.createCharacterController(0.001);

	// 箱の外か中か判定する処理
	let mouseInBox = false;
	window.addEventListener("mousemove", (e) => {
		const calRect = getCalRect();
		const innerRect = {
			left: calRect.left + innerOffsetLeft,
			right: calRect.right - innerOffsetRight,
			top: calRect.top,
			bottom: calRect.bottom,
		};
		const nowInBox = e.clientX > innerRect.left && e.clientX < innerRect.right && e.clientY > innerRect.top && e.clientY < innerRect.bottom;
		if (nowInBox !== mouseInBox) {
			mouseInBox = nowInBox;
			for (let i = 0; i < colliders.length; i++) {
				if (colliders[i] && !drags[i]) {
					// ← ドラッグ中はスキップ
					colliders[i].setSensor(!nowInBox);
				}
			}
		}
	});

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

			if (mouseInBox) {
				characterController.computeColliderMovement(colliders[i], delta);
				const corrected = characterController.computedMovement();
				bodies[i].setNextKinematicTranslation({
					x: current.x + corrected.x,
					y: current.y + corrected.y,
				});
			} else {
				bodies[i].setNextKinematicTranslation({
					x: current.x + delta.x,
					y: current.y + delta.y,
				});
			}
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
				if (insideStates[i]) {
					bodies[i].setBodyType(RAPIER.RigidBodyType.Dynamic);
					colliders[i].setSensor(false);
				}
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
		updateOffsets();
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

		// 箱の外は重力をなくす
		const rect = getCalRect();

		const innerRect = {
			left: rect.left + innerOffsetLeft,
			right: rect.right - innerOffsetRight,
			top: rect.top,
			bottom: rect.bottom,
		};
		let allInside = true;
		for (let i = 0; i < bodies.length; i++) {
			const b = bodies[i];

			const pos = b.translation();
			const x = toPixX(pos.x);
			const y = toPixY(pos.y);

			const domRect = {
				left: x - rects[i].width / 2,
				right: x + rects[i].width / 2,
				top: y - rects[i].height / 2,
				bottom: y + rects[i].height / 2,
			};
			// 完全に内側かチェック（ここ重要）
			const fullyInside = domRect.left >= innerRect.left && domRect.right <= innerRect.right && domRect.top >= innerRect.top && domRect.bottom <= innerRect.bottom;

			if (!fullyInside) {
				allInside = false;
			}

			// 入る判定（タイト）
			const enter = domRect.right > innerRect.left + enterMargin && domRect.left < innerRect.right - enterMargin && domRect.bottom > innerRect.top + enterMargin && domRect.top < innerRect.bottom - enterMargin;

			// 出る判定（広め）
			const exit = domRect.right < innerRect.left - exitMargin || domRect.left > innerRect.right + exitMargin || domRect.bottom < innerRect.top - exitMargin || domRect.top > innerRect.bottom + exitMargin;

			if (drags[i]) continue;

			// 状態更新
			if (!insideStates[i] && enter) {
				insideStates[i] = true;
			}
			if (insideStates[i] && exit) {
				insideStates[i] = false;
			}

			// 状態に応じて制御
			if (insideStates[i]) {
				if (b.bodyType() !== RAPIER.RigidBodyType.Dynamic) {
					b.setBodyType(RAPIER.RigidBodyType.Dynamic);
				}
				colliders[i].setSensor(false);
			} else {
				if (b.bodyType() !== RAPIER.RigidBodyType.KinematicPositionBased) {
					b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
				}
				colliders[i].setSensor(true);
				b.setLinvel({ x: 0, y: 0 }, true);
				b.setAngvel(0, true);
			}
		}
		// ここまで

		for (let i = 0; i < bodies.length; i++) {
			if (!insideStates[i]) continue;
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

		// クリア判定
		if (allInside) {
			clearEl.classList.add("is-cleared");
		} else {
			clearEl.classList.remove("is-cleared");
		}

		requestAnimationFrame(loop);
	}
	loop();
})();

document.querySelector(".js-reset").addEventListener("click", () => {
	location.reload();
});
