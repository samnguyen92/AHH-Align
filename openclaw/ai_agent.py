import os

from dotenv import load_dotenv
from openai import OpenAI

from agent_prompt import OPENCLAW_AGENT_SYSTEM_PROMPT
from jobs import check_status

load_dotenv(".env")
load_dotenv("../.env.local")

DEFAULT_AGENT_MODEL = "deepseek/deepseek-v4-flash"


def build_context() -> str:
    try:
        status = check_status()
    except Exception as exc:
        status = f"Status unavailable: {exc}"

    try:
        from admin_actions import get_analytics_summary
        analytics = get_analytics_summary()
    except Exception as exc:
        analytics = f"Analytics summary unavailable: {exc}"

    return (
        "Runtime context:\n"
        f"{status}\n\n"
        f"{analytics}\n\n"
        "Reminder: normal chat cannot run jobs. Jobs only run through slash commands."
    )


CHAT_STYLE = (
    "Answer in the language of the user's latest message (Vietnamese if they write Vietnamese). "
    "Be natural, short and concrete; answer the actual question using the conversation so far. "
    "If you need something to act (which clinic? which field?), ask ONE short question. "
    "If the bot cannot do what was asked, say so plainly and name the closest command. "
    "Never start with a generic self-introduction."
)


def ask_openclaw_agent(user_message: str, history=None) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return (
            "Mình chưa gọi được AI agent vì thiếu `OPENROUTER_API_KEY` trong `openclaw/.env`. "
            "Bạn cập nhật env trên server rồi chạy `/status` để kiểm tra lại nhé."
        )

    model = os.environ.get("OPENCLAW_AGENT_MODEL", DEFAULT_AGENT_MODEL)
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=60)

    turns = [
        {"role": "assistant" if item.get("role") == "bot" else "user", "content": str(item.get("text", ""))[:600]}
        for item in (history or [])[-8:]
        if item.get("text")
    ]
    if turns and turns[-1]["role"] == "user" and turns[-1]["content"].strip() == user_message.strip():
        turns = turns[:-1]  # the latest message is added below

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": OPENCLAW_AGENT_SYSTEM_PROMPT},
                {"role": "system", "content": CHAT_STYLE},
                {"role": "system", "content": build_context()},
                *turns,
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=900,
        )
        return (response.choices[0].message.content or "").strip() or "Mình chưa có câu trả lời, bạn nói rõ hơn giúp mình nhé."
    except Exception as exc:
        print(f"[!] Chat agent failed: {exc!r}")
        return "Mình đang không kết nối được với bộ não AI. Bạn thử lại sau ít phút nhé."
