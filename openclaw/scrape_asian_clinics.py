import os
import sys

# Ensure current directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from run_scout import run_scout_pipeline

def main():
    print("[*] Bat dau tien trinh cao 30 phong kham ngon ngu chau A...")
    
    # 1. 10 nha si noi tieng Viet o California & Texas
    print("\n>>> Task 1/3: Tim 10 nha si noi tieng Viet tai California/Texas")
    try:
        print("[*] Chay: Vietnamese dentist in California (limit 5)...")
        run_scout_pipeline(
            query="Vietnamese dentist in California",
            limit=5,
            required_languages=["Vietnamese"],
            included_types=["dental_clinic"]
        )
        print("[*] Chay: Vietnamese dentist in Texas (limit 5)...")
        run_scout_pipeline(
            query="Vietnamese dentist in Texas",
            limit=5,
            required_languages=["Vietnamese"],
            included_types=["dental_clinic"]
        )
    except Exception as e:
        print(f"[!] Loi Task 1: {e}")

    # 2. 10 bac si/phong kham noi tieng Han o California/New York
    print("\n>>> Task 2/3: Tim 10 phong kham noi tieng Han o Los Angeles/New York")
    try:
        print("[*] Chay: Korean doctor in Los Angeles (limit 5)...")
        run_scout_pipeline(
            query="Korean doctor in Los Angeles",
            limit=5,
            required_languages=["Korean"],
            included_types=["doctor"]
        )
        print("[*] Chay: Korean clinic in New York (limit 5)...")
        run_scout_pipeline(
            query="Korean clinic in New York",
            limit=5,
            required_languages=["Korean"],
            included_types=["doctor"]
        )
    except Exception as e:
        print(f"[!] Loi Task 2: {e}")

    # 3. 10 benh vien/phong kham lon noi tieng Trung o San Francisco/Seattle
    print("\n>>> Task 3/3: Tim 10 phong kham noi tieng Trung o San Francisco/Seattle")
    try:
        print("[*] Chay: Chinese speaking clinic in San Francisco (limit 5)...")
        run_scout_pipeline(
            query="Chinese speaking clinic in San Francisco",
            limit=5,
            required_languages=["Chinese"],
            included_types=["doctor"]
        )
        print("[*] Chay: Chinese medical clinic in Seattle (limit 5)...")
        run_scout_pipeline(
            query="Chinese medical clinic in Seattle",
            limit=5,
            required_languages=["Chinese"],
            included_types=["doctor"]
        )
    except Exception as e:
        print(f"[!] Loi Task 3: {e}")

    print("\n[+] Hoan tat tien trinh cao 30 phong kham!")

if __name__ == "__main__":
    main()
