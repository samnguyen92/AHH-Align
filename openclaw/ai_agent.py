import os

from dotenv import load_dotenv
from openai import OpenAI

from agent_prompt import OPENCLAW_AGENT_SYSTEM_PROMPT
from jobs import check_status

load_dotenv(".env")
load_dotenv("../.env.local")

DEFAULT_AGENT_MODEL = "deepseek/deepseek-chat"


def build_context() -> str:
    try:
        status = check_status()
    except Exception as exc:
        status = f"Status unavailable: {exc}"

    return (
        "Runtime context:\n"
        f"{status}\n\n"
        "Reminder: normal chat cannot run jobs. Jobs only run through slash commands."
    )


def ask_openclaw_agent(user_message: str) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return (
            "Mình chưa gọi được AI agent vì thiếu `OPENROUTER_API_KEY` trong `openclaw/.env`. "
            "Bạn cập nhật env trên server rồi chạy `/status` để kiểm tra lại nhé."
        )

    model = os.environ.get("OPENCLAW_AGENT_MODEL", DEFAULT_AGENT_MODEL)
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": OPENCLAW_AGENT_SYSTEM_PROMPT},
            {"role": "system", "content": build_context()},
            {"role": "user", "content": user_message},
        ],
        temperature=0.2,
    )

    return response.choices[0].message.content.strip()
