import { toBlob } from "html-to-image";

const btn = document.querySelector(".js-capture");
const node = document.getElementById("capture-area");

const options = {
	cacheBust: true,
	useCORS: true,
	pixelRatio: 1,
};

btn.addEventListener("click", async () => {
	console.log("capture start");

	try {
		// Safari安定化
		if (document.fonts?.ready) {
			await document.fonts.ready;
		}
		await new Promise((r) => requestAnimationFrame(r));
		await new Promise((r) => requestAnimationFrame(r));

		// 🔥 warm-up はここでやる（外に出さない）
		await toBlob(node, options);

		// 本番
		const blob = await toBlob(node, options);

		if (!blob) throw new Error("blob failed");

		const url = URL.createObjectURL(blob);

		if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
			window.open(url, "_blank");
		} else {
			const a = document.createElement("a");
			a.download = "capture.png";
			a.href = url;
			a.click();
		}

		console.log("capture success");
	} catch (e) {
		console.error("capture error:", e);
	}
});
