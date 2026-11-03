// 에어코리아 응답을 확인해 프런트엔드에 안전한 JSON으로 전달합니다.
const API_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

module.exports = async function handler(req, res) {
  const sido = typeof req.query.sido === "string" && req.query.sido.trim()
    ? req.query.sido.trim()
    : "서울";
  const serviceKey = process.env.AIRKOREA_KEY;

  if (!serviceKey) {
    return res.status(500).json({ message: "AIRKOREA_KEY 환경변수를 설정해주세요." });
  }

  const query = [
    `serviceKey=${encodeURIComponent(serviceKey)}`,
    "returnType=json",
    `sidoName=${encodeURIComponent(sido)}`,
    "numOfRows=100",
    "pageNo=1",
    "ver=1.3"
  ].join("&");

  try {
    const response = await fetch(`${API_URL}?${query}`);
    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({ message: "인증키 또는 요청값을 확인해주세요" });
    }

    const resultCode = data?.response?.header?.resultCode;
    if (!response.ok || String(resultCode) !== "00") {
      return res.status(502).json({
        message: "에어코리아 요청에 실패했습니다. 인증키 또는 요청값을 확인해주세요",
        resultCode: resultCode ?? null
      });
    }

    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ message: "에어코리아 서버에 연결하지 못했습니다." });
  }
};
