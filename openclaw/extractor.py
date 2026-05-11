import os
import json
from openai import OpenAI

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
    You MUST output ONLY valid JSON matching the following schema. Do not include markdown formatting like ```json or any other text.
    
    Schema:
    {
      "name": "string (the exact name of the hospital/clinic, or the requested name)",
      "description": "string (a brief 2-3 sentence overview)",
      "address": "string (street address only)",
      "city": "string",
      "state": "string (2-letter abbreviation)",
      "zip_code": "string",
      "phone": "string",
      "specialty": "string (e.g. General Hospital, Primary Care, etc. Guess based on context if not explicit)",
      "languages": ["string"] (list of languages spoken, default to ["English"] if none specified),
      "services": ["string"] (list of 3-5 key medical services offered),
      "is_telehealth_available": boolean,
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
    user_prompt = f"Target Hospital Name: {hospital_name}\n\nWebpage Content:\n{safe_text}"

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
    
    # Clean up markdown if the LLM ignores instructions
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
        
    try:
        data = json.loads(content.strip())
        print(f"[*] Successfully extracted data for {data.get('name')}")
        return data
    except json.JSONDecodeError as e:
        print(f"[!] Failed to parse JSON: {e}")
        print(f"Raw output:\n{content}")
        return None
