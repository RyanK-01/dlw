from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openai import OpenAI

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from firebase import db


NEIGHBOURHOOD_CENTERS: list[tuple[str, float, float]] = [
    ("Jurong East", 1.3331, 103.7436),
    ("Bukit Batok", 1.3496, 103.7520),
    ("Clementi", 1.3151, 103.7652),
    ("Queenstown", 1.2942, 103.7876),
    ("Bukit Timah", 1.3294, 103.8021),
    ("Orchard", 1.3048, 103.8318),
    ("Novena", 1.3201, 103.8437),
    ("Toa Payoh", 1.3343, 103.8519),
    ("Bishan", 1.3508, 103.8485),
    ("Ang Mo Kio", 1.3691, 103.8454),
    ("Yishun", 1.4291, 103.8359),
    ("Woodlands", 1.4360, 103.7860),
    ("Sengkang", 1.3919, 103.8955),
    ("Punggol", 1.4043, 103.9020),
    ("Serangoon", 1.3521, 103.8738),
    ("Hougang", 1.3612, 103.8863),
    ("Tampines", 1.3496, 103.9568),
    ("Pasir Ris", 1.3730, 103.9493),
    ("Bedok", 1.3236, 103.9273),
    ("Geylang", 1.3162, 103.8980),
    ("Kallang", 1.3090, 103.8660),
    ("Marina Bay", 1.2760, 103.8546),
    ("Chinatown", 1.2838, 103.8437),
    ("Sentosa", 1.2494, 103.8303),
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def _nearest_neighbourhood(lat: float | None, lng: float | None) -> str:
    if lat is None or lng is None:
        return "Unknown"

    nearest_name = "Unknown"
    nearest_distance = float("inf")
    for name, center_lat, center_lng in NEIGHBOURHOOD_CENTERS:
        distance = _haversine_km(lat, lng, center_lat, center_lng)
        if distance < nearest_distance:
            nearest_distance = distance
            nearest_name = name

    return nearest_name


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _join_classes(value: Any) -> list[str]:
    if isinstance(value, str):
        cleaned = value.strip()
        return [cleaned] if cleaned else []

    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            label = str(item).strip()
            if label:
                out.append(label)
        return out

    return []


def _extract_prompt_fields(incident: dict[str, Any]) -> dict[str, Any]:
    current_time = _normalize_value(
        incident.get("timestamp")
        or incident.get("updatedAt")
        or incident.get("createdAt")
        or datetime.now(timezone.utc)
    )

    location = incident.get("location") if isinstance(incident.get("location"), dict) else {}
    lat = _as_float(incident.get("lat"))
    if lat is None:
        lat = _as_float(location.get("latitude"))

    lng = _as_float(incident.get("lng"))
    if lng is None:
        lng = _as_float(location.get("longitude"))

    classes: list[str] = []
    for key in ("yolo_classes", "detected_classes", "ai_detected_classes", "classes"):
        classes.extend(_join_classes(incident.get(key)))

    fallback = str(incident.get("incident_type") or incident.get("category") or "").strip()
    if fallback:
        classes.append(fallback)

    deduped_classes: list[str] = []
    seen: set[str] = set()
    for cls in classes:
        token = cls.lower()
        if token in seen:
            continue
        seen.add(token)
        deduped_classes.append(cls)

    confidence_score = _as_float(incident.get("confidence"))
    if confidence_score is None:
        confidence_score = _as_float(incident.get("riskScore"))

    offline_or_online = str(
        incident.get("system_status")
        or incident.get("camera_status")
        or incident.get("operational_status")
        or "unknown"
    ).strip() or "unknown"

    return {
        "current_time": current_time,
        "lat": lat,
        "lng": lng,
        "nearest_neighbourhood": _nearest_neighbourhood(lat, lng),
        "yolo_classes_string": ", ".join(deduped_classes) if deduped_classes else "Unknown",
        "confidence_score": confidence_score,
        "offline_or_online": offline_or_online,
    }


def _normalize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()

    if hasattr(value, "to_datetime"):
        try:
            dt = value.to_datetime()
            if isinstance(dt, datetime):
                return dt.isoformat()
        except Exception:
            pass

    if isinstance(value, dict):
        return {k: _normalize_value(v) for k, v in value.items()}

    if isinstance(value, list):
        return [_normalize_value(v) for v in value]

    return value


def _pick_incident(limit: int) -> tuple[str, dict[str, Any]]:
    query = db.collection("incidents").order_by("updatedAt", direction="DESCENDING").limit(limit)
    docs = list(query.stream())

    if not docs:
        raise RuntimeError("No incidents found in Firestore.")

    print("\nAvailable incidents:\n")
    for idx, snap in enumerate(docs, start=1):
        data = snap.to_dict() or {}
        status = data.get("status", "UNKNOWN")
        category = data.get("category", data.get("incident_type", "unknown"))
        risk = float(data.get("riskScore", data.get("confidence", 0.0)))
        updated = _normalize_value(data.get("updatedAt", data.get("createdAt", "n/a")))
        print(f"{idx:>2}. {snap.id} | {status} | {category} | risk={risk:.2f} | updated={updated}")

    raw = input("\nChoose incident number to generate report: ").strip()
    try:
        selected_idx = int(raw)
    except ValueError as exc:
        raise RuntimeError("Invalid selection. Please enter a number.") from exc

    if selected_idx < 1 or selected_idx > len(docs):
        raise RuntimeError("Selection out of range.")

    selected = docs[selected_idx - 1]
    return selected.id, (selected.to_dict() or {})


def _build_report(incident_id: str, incident: dict[str, Any]) -> tuple[dict[str, Any], str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in environment.")

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    prompt_fields = _extract_prompt_fields(incident)
    confidence_text = "Unknown" if prompt_fields["confidence_score"] is None else f"{prompt_fields['confidence_score']:.4f}"
    lat_text = "Unknown" if prompt_fields["lat"] is None else f"{prompt_fields['lat']:.6f}"
    lng_text = "Unknown" if prompt_fields["lng"] is None else f"{prompt_fields['lng']:.6f}"

    system_prompt = (
        "You are an automated Public Safety Incident Reporter operating on an edge-based security system. "
        "Your task is to analyze raw detection metadata from a CCTV feed and generate a concise, objective, and highly accurate incident report for police responders.\\n\\n"
        "Rules:\\n\\n"
        "Remain strictly objective. Do not assume intent (e.g., say 'Two individuals observed making physical contact' instead of 'Two people fighting').\\n\\n"
        "Keep the summary under 3 sentences and strictly factual.\\n\\n"
        "For recommended_action, provide 2 to 3 short, actionable responder directives in one string, separated by semicolons, and include key considerations responders should take into account (for example safety perimeter, verification priority, or escalation criteria). Keep tone objective and operational.\\n\\n"
        "You MUST output your response entirely in valid JSON format. Do not include markdown formatting like ```json or any other text outside the JSON object."
    )

    user_prompt = (
        "Generate an incident report for the following raw detection data:\\n\\n"
        f"Timestamp: {prompt_fields['current_time']}\\n\\n"
        f"Nearest neighbourhood: {prompt_fields['nearest_neighbourhood']}\\n\\n"
        f"Location coordinates: {lat_text}, {lng_text}\\n\\n"
        f"AI Detected Classes: {prompt_fields['yolo_classes_string']}\\n\\n"
        f"Maximum Confidence Score: {confidence_text}\\n\\n"
        f"System Status: {prompt_fields['offline_or_online']}\\n\\n"
        "Use the following JSON schema:\\n"
        "{\"incident_title\": \"Short 3-4 word title\", \"severity_level\": \"Low, Medium, High, or Critical based on classes\", \"objective_summary\": \"Your 3 sentence description of the event\", \"recommended_action\": \"2-3 concise responder actions in one string separated by semicolons, including key considerations to take into account\"}"
    )

    try:
        completion = client.chat.completions.create(
            model=model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:
        message = str(exc)
        lower_message = message.lower()
        if "invalid_api_key" in lower_message or "incorrect api key" in lower_message or "authentication" in lower_message:
            raise RuntimeError(
                "OpenAI authentication failed. Set a valid OPENAI_API_KEY in Backend/.env and restart the backend."
            ) from exc
        if "rate" in lower_message and "limit" in lower_message:
            raise RuntimeError("OpenAI rate limit reached. Please try again shortly.") from exc
        raise RuntimeError(f"OpenAI request failed: {message}") from exc

    content = completion.choices[0].message.content if completion.choices else None
    if not content:
        raise RuntimeError("OpenAI returned empty response")

    report = json.loads(content)
    incident_title = str(report.get("incident_title", "")).strip()
    severity_level = str(report.get("severity_level", "")).strip()
    objective_summary = str(report.get("objective_summary", "")).strip()
    recommended_action = str(report.get("recommended_action", "")).strip()
    if recommended_action:
        recommended_action = " ".join(recommended_action.split())

    if not incident_title:
        raise RuntimeError("OpenAI output missing incident_title")
    if not severity_level:
        raise RuntimeError("OpenAI output missing severity_level")
    if not objective_summary:
        raise RuntimeError("OpenAI output missing objective_summary")
    if not recommended_action:
        raise RuntimeError("OpenAI output missing recommended_action")

    normalized_rows = [
        {"field": "Incident Title", "value": incident_title},
        {"field": "Severity Level", "value": severity_level},
        {"field": "Timestamp", "value": str(prompt_fields["current_time"])},
        {"field": "Nearest Neighbourhood", "value": str(prompt_fields["nearest_neighbourhood"])},
        {"field": "Coordinates", "value": f"{lat_text}, {lng_text}"},
        {"field": "AI Detected Classes", "value": str(prompt_fields["yolo_classes_string"])},
        {"field": "Maximum Confidence", "value": confidence_text},
        {"field": "System Status", "value": str(prompt_fields["offline_or_online"])},
    ]

    normalized_report = {
        "rows": normalized_rows,
        "summary": objective_summary,
        "recommendedActions": [recommended_action],
        "incident_title": incident_title,
        "severity_level": severity_level,
        "objective_summary": objective_summary,
        "recommended_action": recommended_action,
    }

    return normalized_report, model


def _save_report(incident_id: str, incident: dict[str, Any], report: dict[str, Any], model: str) -> str:
    now = datetime.now(timezone.utc)

    container_doc = {
        "incidentId": incident_id,
        "incidentStatus": incident.get("status", "UNKNOWN"),
        "report": report,
        "model": model,
        "source": "openai",
        "createdAt": now,
        "updatedAt": now,
    }

    ref = db.collection("incident_reports").document()
    ref.set(container_doc)

    db.collection("incidents").document(incident_id).set(
        {
            "report_id": ref.id,
            "llmReport": {
                **report,
                "generatedAt": now,
                "model": model,
            },
            "updatedAt": now,
        },
        merge=True,
    )

    return ref.id


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate incident report from Firebase incident using OpenAI")
    parser.add_argument("--incident-id", dest="incident_id", default=None, help="Incident id to generate report for")
    parser.add_argument("--limit", dest="limit", type=int, default=20, help="Number of recent incidents to show")
    args = parser.parse_args()

    if args.incident_id:
        snap = db.collection("incidents").document(args.incident_id).get()
        if not snap.exists:
            raise RuntimeError(f"Incident not found: {args.incident_id}")
        incident_id = snap.id
        incident = snap.to_dict() or {}
    else:
        incident_id, incident = _pick_incident(max(1, args.limit))

    report, model = _build_report(incident_id, incident)
    report_id = _save_report(incident_id, incident, report, model)

    print("\nReport generated and saved successfully")
    print(f"Incident ID: {incident_id}")
    print(f"Report container ID: {report_id}")
    print(f"Model: {model}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())