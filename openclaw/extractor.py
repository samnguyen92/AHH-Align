import os
import json
import re
from openai import OpenAI


def _extract_json_object(text: str) -> dict:
    """
    Parse the first JSON object from an LLM response.
    """
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            raise
        return json.loads(match.group(0))


def extract_clinic_data(hospital_name: str, text_content: str) -> dict:
    """
    Extract structured clinic data from raw text using OpenRouter (Deepseek).
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("[!] OPENROUTER_API_KEY is not set.")
        return None

    # Using standard OpenAI client pointed to OpenRouter
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    system_prompt = """
    You are an AI data extractor for a healthcare directory.
    Your job is to extract clinic/hospital information from the provided text.
    Use ONLY the provided webpage text. If a value is not present, use null, [], {}, or false.
    Do not invent provider names, insurance plans, credentials, conditions, or FAQs.
    You MUST output ONLY valid JSON matching the following schema. Do not include markdown formatting like ```json or any other text.
    
    Schema:
    {
      "name": "string (the exact name of the hospital/clinic, or the requested name)",
      "description": "string (a brief 2-4 sentence overview)",
      "address": "string (street address only)",
      "city": "string",
      "state": "string (2-letter abbreviation)",
      "zip_code": "string",
      "phone": "string",
      "website": "string or null",
      "appointment_url": "string or null",
      "email": "string or null",
      "fax": "string or null",
      "specialty": "string (e.g. General Hospital, Primary Care, etc. Guess based on context if not explicit)",
      "languages": ["string"] (list of languages spoken, default to ["English"] if none specified),
      "language_note": "string or null (specific note about language access, interpreter availability, or bilingual staff)",
      "services": ["string"] (list of key medical services offered),
      "conditions_treated": ["string"] (common conditions or patient needs explicitly mentioned),
      "insurance_accepted": ["string"] (insurance plans, payer names, Medicare/Medicaid/new-patient payment notes),
      "accepting_new_patients": "boolean or null",
      "is_telehealth_available": boolean,
      "provider_credentials": {
        "providers": ["string"],
        "education": ["string"],
        "board_certifications": ["string"],
        "residency": ["string"],
        "hospital_affiliations": ["string"],
        "years_in_practice": "string or null",
        "professional_memberships": ["string"]
      },
      "review_summary": "string or null",
      "faqs": [
        {"question": "string", "answer": "string"}
      ],
      "working_hours": {
         "monday": "string",
         "tuesday": "string",
         "wednesday": "string",
         "thursday": "string",
         "friday": "string",
         "saturday": "string",
         "sunday": "string"
      }
    }
    """

    # Limit text to roughly 20k chars to prevent context overflow if pages are massive
    safe_text = text_content[:20000]
    user_prompt = f"""
    Target Hospital Name: {hospital_name}

    Extract as much of the schema as the page supports. Prioritize information needed for a rich clinic profile:
    services offered, commonly treated conditions, insurance/new-patient status, Vietnamese/Korean/Asian-language access,
    provider credentials, FAQ-style patient questions, website/appointment links, phone, address, hours, and review summary.

    Webpage Content:
    {safe_text}
    """

    print(f"[*] Sending extraction request to OpenRouter (Deepseek v4 Flash)...")
    try:
        response = client.chat.completions.create(
            model="deepseek/deepseek-chat", # deepseek-v4-flash is routed via deepseek-chat or specific ID. OpenRouter standard deepseek id is "deepseek/deepseek-chat" or "deepseek/deepseek-v4-flash" if specified. We will use the exact string provided by user.
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1
        )
    except Exception as e:
        # Fallback to the exact string user gave if deepseek-chat was changed
        try:
             response = client.chat.completions.create(
                model="deepseek/deepseek-v4-flash", 
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1
            )
        except Exception as e2:
            print(f"[!] OpenRouter API Error: {e2}")
            return None

    content = response.choices[0].message.content.strip()

    try:
        data = _extract_json_object(content)
        print(f"[*] Successfully extracted data for {data.get('name')}")
        return data
    except json.JSONDecodeError as e:
        print(f"[!] Failed to parse JSON: {e}")
        print(f"Raw output:\n{content}")
        return None
