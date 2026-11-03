// 자체 서버리스 함수에서 받은 자료로 시도 평균과 측정소별 대기질 카드를 표시합니다.

const regionSelect = document.querySelector("#region-select");
const locationMessage = document.querySelector("#location-message");
const selectedRegion = document.querySelector("#selected-region");
const airStatus = document.querySelector("#air-status");
const statusEmoji = document.querySelector("#status-emoji");
const statusLabel = document.querySelector("#status-label");
const averageValue = document.querySelector("#average-value");
const averageNote = document.querySelector("#average-note");
const healthMessage = document.querySelector("#health-message");
const stationCount = document.querySelector("#station-count");
const statusMessage = document.querySelector("#status-message");
const chartMessage = document.querySelector("#chart-message");
const chartCanvas = document.querySelector("#station-chart");
const stationSearch = document.querySelector("#station-search");
const stationList = document.querySelector("#station-list");

let activeRequest;
let stationChart;
let currentStations = [];

const regionAliases = {
  서울: ["서울", "seoul"],
  부산: ["부산", "busan"],
  대구: ["대구", "daegu"],
  인천: ["인천", "incheon"],
  광주: ["광주", "gwangju"],
  대전: ["대전", "daejeon"],
  울산: ["울산", "ulsan"],
  세종: ["세종", "sejong"],
  경기: ["경기", "gyeonggi"],
  강원: ["강원", "gangwon"],
  충북: ["충북", "충청북도", "chungcheongbuk", "north chungcheong"],
  충남: ["충남", "충청남도", "chungcheongnam", "south chungcheong"],
  전북: ["전북", "전라북도", "전북특별자치도", "jeollabuk", "north jeolla"],
  전남: ["전남", "전라남도", "jeollanam", "south jeolla"],
  경북: ["경북", "경상북도", "gyeongsangbuk", "north gyeongsang"],
  경남: ["경남", "경상남도", "gyeongsangnam", "south gyeongsang"],
  제주: ["제주", "jeju"]
};

function findRegion(address) {
  const addressParts = [
    address.state,
    address.province,
    address.city,
    address.municipality,
    address.county,
    address.state_district
  ].filter(Boolean).join(" ").toLocaleLowerCase("ko");

  return Object.entries(regionAliases).find(([, aliases]) => (
    aliases.some((alias) => addressParts.includes(alias.toLocaleLowerCase("ko")))
  ))?.[0] || null;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 300000,
      timeout: 10000
    });
  });
}

async function selectInitialRegion() {
  const fallbackRegion = "서울";

  if (!navigator.geolocation) {
    locationMessage.textContent = "이 브라우저에서는 위치를 확인할 수 없어 서울을 표시합니다.";
    loadAirQuality(fallbackRegion);
    return;
  }

  locationMessage.textContent = "현재 위치를 확인하고 있습니다...";

  try {
    const position = await getCurrentPosition();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    let response;

    try {
      const parameters = new URLSearchParams({
        format: "jsonv2",
        lat: String(position.coords.latitude),
        lon: String(position.coords.longitude),
        zoom: "5",
        addressdetails: "1",
        "accept-language": "ko"
      });
      response = await fetch(`https://nominatim.openstreetmap.org/reverse?${parameters}`, {
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`위치 검색 응답 오류 (${response.status})`);
    }

    const result = await response.json();
    const region = findRegion(result.address || {});
    if (!region || !Array.from(regionSelect.options).some((option) => option.value === region)) {
      throw new Error("현재 위치의 시도를 찾을 수 없습니다.");
    }

    regionSelect.value = region;
    locationMessage.textContent = `현재 위치를 기준으로 ${region} 지역을 표시합니다.`;
    loadAirQuality(region);
  } catch (error) {
    locationMessage.textContent = error.name === "AbortError"
      ? "위치 검색 시간이 초과되어 서울을 표시합니다."
      : "위치를 확인하지 못해 서울을 표시합니다. 시도를 직접 선택할 수 있습니다.";
    loadAirQuality(fallbackRegion);
  }
}

function getNumericValue(value) {
  if (value === null || value === undefined || String(value).trim() === "" || String(value).trim() === "-") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function displayMeasurement(value) {
  const numericValue = getNumericValue(value);
  return numericValue === null ? "측정 안 됨" : `${numericValue} ㎍/㎥`;
}

function getAirQualityInfo(value) {
  if (value <= 30) {
    return { className: "grade-1", emoji: "🔵", label: "좋음" };
  }
  if (value <= 80) {
    return { className: "grade-2", emoji: "🟢", label: "보통" };
  }
  if (value <= 150) {
    return { className: "grade-3", emoji: "🟠", label: "나쁨" };
  }
  return { className: "grade-4", emoji: "🔴", label: "매우나쁨" };
}

function getGradeInfo(grade) {
  const gradeLabels = {
    "1": { className: "grade-1", label: "좋음" },
    "2": { className: "grade-2", label: "보통" },
    "3": { className: "grade-3", label: "나쁨" },
    "4": { className: "grade-4", label: "매우 나쁨" }
  };
  const normalizedGrade = String(grade ?? "").trim();
  return gradeLabels[normalizedGrade] || { className: "grade-unknown", label: "등급 정보 없음" };
}

function getGradeColor(grade) {
  const gradeColors = {
    "1": "#3785e8",
    "2": "#42a765",
    "3": "#e89332",
    "4": "#e4564e"
  };
  return gradeColors[String(grade ?? "").trim()] || "#9aa3b1";
}

function renderStationChart(stations) {
  if (stationChart) {
    stationChart.destroy();
    stationChart = undefined;
  }

  const topStations = stations
    .map((station) => ({ station, value: getNumericValue(station.pm10Value) }))
    .filter(({ value }) => value !== null)
    .sort((first, second) => second.value - first.value)
    .slice(0, 10);

  if (!topStations.length) {
    chartCanvas.hidden = true;
    chartMessage.textContent = "그래프로 표시할 측정값이 없습니다.";
    return;
  }

  chartCanvas.hidden = false;
  if (typeof Chart === "undefined") {
    chartMessage.textContent = "그래프를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.";
    return;
  }

  chartMessage.textContent = "";
  stationChart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels: topStations.map(({ station }) => station.stationName || "이름 없는 측정소"),
      datasets: [{
        label: "미세먼지 PM10",
        data: topStations.map(({ value }) => value),
        backgroundColor: topStations.map(({ station }) => getGradeColor(station.pm10Grade)),
        borderColor: topStations.map(({ station }) => getGradeColor(station.pm10Grade)),
        borderWidth: 1,
        borderRadius: 5,
        barPercentage: 0.72,
        categoryPercentage: 0.82
      }]
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `미세먼지 PM10: ${context.parsed.x} ㎍/㎥`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: "미세먼지 PM10 (㎍/㎥)" },
          ticks: { precision: 0 }
        },
        y: {
          reverse: true,
          grid: { display: false }
        }
      }
    }
  });
}

function formatMeasurementTime(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):\d{2}/);
  if (!match) {
    return value ? `${value} 기준` : "측정 안 됨";
  }

  const [, year, month, day, hour] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일 ${Number(hour)}시 기준`;
}

function createMeasurement(label, value, extraClass = "") {
  const item = document.createElement("div");
  if (extraClass) {
    item.className = extraClass;
  }

  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "측정 안 됨";
  item.append(term, description);
  return item;
}

function createStationCard(station) {
  const gradeInfo = getGradeInfo(station.pm10Grade);
  const card = document.createElement("article");
  card.className = `station-card ${gradeInfo.className}`;

  const heading = document.createElement("div");
  heading.className = "card-heading";

  const name = document.createElement("h3");
  name.className = "station-name";
  name.textContent = station.stationName || "이름 없는 측정소";

  const grade = document.createElement("span");
  grade.className = "grade-label";
  grade.textContent = gradeInfo.label;
  heading.append(name, grade);

  const measurements = document.createElement("dl");
  measurements.className = "measurement-list";
  measurements.append(
    createMeasurement("미세먼지 PM10", displayMeasurement(station.pm10Value)),
    createMeasurement("초미세먼지 PM2.5", displayMeasurement(station.pm25Value)),
    createMeasurement("측정 시각", formatMeasurementTime(station.dataTime), "measured-at")
  );

  card.append(heading, measurements);
  return card;
}

function renderStationCards() {
  const searchTerm = stationSearch.value.trim().toLocaleLowerCase("ko");
  const filteredStations = currentStations.filter((station) => (
    String(station.stationName || "").toLocaleLowerCase("ko").includes(searchTerm)
  ));

  stationList.replaceChildren(...filteredStations.map(createStationCard));
  stationCount.textContent = searchTerm
    ? `검색 결과 ${filteredStations.length}곳 / 전체 ${currentStations.length}곳`
    : `측정소 ${currentStations.length}곳`;
  statusMessage.textContent = currentStations.length === 0
    ? "표시할 측정소 정보가 없습니다."
    : filteredStations.length === 0
      ? "검색 결과가 없습니다."
      : "";
}

function showError(message) {
  statusMessage.textContent = message;
  airStatus.setAttribute("aria-busy", "false");
  airStatus.className = "air-status grade-unknown";
  statusEmoji.textContent = "⚪";
  statusLabel.textContent = "정보 없음";
  averageValue.textContent = "측정 안 됨";
  averageNote.textContent = "평균 미세먼지(PM10)";
  healthMessage.textContent = "대기질 정보를 확인할 수 없습니다.";
  stationCount.textContent = "";
  currentStations = [];
  stationList.replaceChildren();
  renderStationChart([]);
}

async function loadAirQuality(region) {
  selectedRegion.textContent = region;
  if (activeRequest) {
    activeRequest.abort();
  }
  activeRequest = new AbortController();
  const requestController = activeRequest;

  airStatus.setAttribute("aria-busy", "true");
  airStatus.className = "air-status is-loading";
  statusEmoji.textContent = "⏳";
  statusLabel.textContent = "불러오는 중...";
  averageValue.textContent = "불러오는 중...";
  averageNote.textContent = "평균 미세먼지(PM10)";
  healthMessage.textContent = "측정 정보를 불러오는 중...";
  stationCount.textContent = "";
  currentStations = [];
  stationSearch.value = "";
  stationList.replaceChildren();
  renderStationChart([]);
  chartMessage.textContent = "측정 정보를 불러오는 중입니다.";
  statusMessage.textContent = "측정 정보를 불러오는 중입니다.";

  try {
    const response = await fetch(`/api/dust?sido=${encodeURIComponent(region)}`, {
      signal: requestController.signal
    });
    const result = await response.json();
    if (activeRequest !== requestController) {
      return;
    }
    if (!response.ok) {
      throw new Error(result.message || `서버 응답 오류 (${response.status})`);
    }

    const body = result?.response?.body;
    const resultCode = result?.response?.header?.resultCode;
    if (!body || (resultCode && resultCode !== "00")) {
      const resultMessage = result?.response?.header?.resultMsg || "API 응답을 확인할 수 없습니다.";
      throw new Error(resultMessage);
    }

    const stations = Array.isArray(body.items) ? body.items : [];
    const pm10Values = stations
      .map((station) => getNumericValue(station.pm10Value))
      .filter((value) => value !== null);
    const mean = pm10Values.length
      ? pm10Values.reduce((total, value) => total + value, 0) / pm10Values.length
      : null;

    airStatus.setAttribute("aria-busy", "false");
    const quality = mean === null ? null : getAirQualityInfo(mean);
    airStatus.className = `air-status ${quality?.className || "grade-unknown"}`;
    statusEmoji.textContent = quality?.emoji || "⚪";
    statusLabel.textContent = quality?.label || "정보 없음";
    averageValue.textContent = mean === null ? "측정 안 됨" : mean.toFixed(1);
    averageNote.textContent = "평균 미세먼지(PM10)";
    healthMessage.textContent = quality && (quality.label === "나쁨" || quality.label === "매우나쁨")
      ? "외출 시 마스크를 챙기세요"
      : quality
        ? "지역 평균 미세먼지 기준으로 표시합니다."
        : "계산할 수 있는 미세먼지 측정값이 없습니다.";
    currentStations = stations;
    renderStationChart(stations);
    renderStationCards();
  } catch (error) {
    if (error.name === "AbortError" || activeRequest !== requestController) {
      return;
    }
    showError(`대기질 정보를 불러오지 못했습니다: ${error.message}`);
  }
}

regionSelect.addEventListener("change", (event) => {
  locationMessage.textContent = "선택한 시도의 대기질을 표시합니다.";
  loadAirQuality(event.target.value);
});

stationSearch.addEventListener("input", renderStationCards);

selectInitialRegion();
