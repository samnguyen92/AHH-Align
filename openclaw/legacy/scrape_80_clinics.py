import os
import sys
import time

# Ensure current directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from run_scout import run_scout_pipeline

def run_safe_scout(query, limit, lang, types):
    print(f"\n>>> Dang chay: query='{query}', limit={limit}, lang={lang}, types={types}")
    try:
        run_scout_pipeline(
            query=query,
            limit=limit,
            required_languages=lang,
            included_types=types
        )
    except Exception as e:
        print(f"[!] Loi khi chay scout cho '{query}': {e}")
    # Cho 2 giay de tranh spam API
    time.sleep(2)

def main():
    print("=====================================================================")
    print(" Bat dau tien trinh cao 80 phong kham/benh vien tai 8 thanh pho lon ")
    print(" (Da doi cac muc nha khoa tieng Viet sang benh vien tieng Viet) ")
    print("=====================================================================\n")

    # 1. New York, NY (10 clinics)
    print("--- [1/8] NEW YORK, NY ---")
    run_safe_scout("Vietnamese speaking hospital in New York, NY", limit=3, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Korean doctor in New York, NY", limit=3, lang=["Korean"], types=["doctor"])
    run_safe_scout("Chinese speaking hospital in New York, NY", limit=4, lang=["Chinese"], types=["hospital"])

    # 2. Los Angeles, CA (10 clinics)
    print("--- [2/8] LOS ANGELES, CA ---")
    run_safe_scout("Vietnamese speaking hospital in Los Angeles, CA", limit=3, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Korean doctor in Los Angeles, CA", limit=4, lang=["Korean"], types=["doctor"])
    run_safe_scout("Chinese speaking dentist in Los Angeles, CA", limit=3, lang=["Chinese"], types=["dental_clinic"])

    # 3. San Jose, CA (10 clinics)
    print("--- [3/8] SAN JOSE, CA ---")
    run_safe_scout("Vietnamese speaking hospital in San Jose, CA", limit=4, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Chinese doctor in San Jose, CA", limit=3, lang=["Chinese"], types=["doctor"])
    run_safe_scout("Korean clinic in San Jose, CA", limit=3, lang=["Korean"], types=["doctor"])

    # 4. Houston, TX (10 clinics)
    print("--- [4/8] HOUSTON, TX ---")
    run_safe_scout("Vietnamese speaking hospital in Houston, TX", limit=4, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Chinese dentist in Houston, TX", limit=3, lang=["Chinese"], types=["dental_clinic"])
    run_safe_scout("Korean clinic in Houston, TX", limit=3, lang=["Korean"], types=["doctor"])

    # 5. Seattle, WA (10 clinics)
    print("--- [5/8] SEATTLE, WA ---")
    run_safe_scout("Vietnamese speaking hospital in Seattle, WA", limit=3, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Chinese acupuncture in Seattle, WA", limit=3, lang=["Chinese"], types=["doctor"])
    run_safe_scout("Korean doctor in Seattle, WA", limit=4, lang=["Korean"], types=["doctor"])

    # 6. Dallas, TX (10 clinics)
    print("--- [6/8] DALLAS, TX ---")
    run_safe_scout("Vietnamese speaking hospital in Dallas, TX", limit=4, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Korean dentist in Dallas, TX", limit=3, lang=["Korean"], types=["dental_clinic"])
    run_safe_scout("Chinese clinic in Dallas, TX", limit=3, lang=["Chinese"], types=["doctor"])

    # 7. Atlanta, GA (10 clinics)
    print("--- [7/8] ATLANTA, GA ---")
    run_safe_scout("Vietnamese speaking hospital in Atlanta, GA", limit=3, lang=["Vietnamese"], types=["hospital"])
    run_safe_scout("Korean doctor in Atlanta, GA", limit=4, lang=["Korean"], types=["doctor"])
    run_safe_scout("Chinese clinic in Atlanta, GA", limit=3, lang=["Chinese"], types=["doctor"])

    # 8. Chicago, IL (10 clinics)
    print("--- [8/8] CHICAGO, IL ---")
    run_safe_scout("Chinese dentist in Chicago, IL", limit=3, lang=["Chinese"], types=["dental_clinic"])
    run_safe_scout("Korean doctor in Chicago, IL", limit=3, lang=["Korean"], types=["doctor"])
    run_safe_scout("Vietnamese speaking hospital in Chicago, IL", limit=4, lang=["Vietnamese"], types=["hospital"])

    print("\n=====================================================================")
    print(" Hoan tat tien trinh cao 80 phong kham/benh vien tai 8 thanh pho lon! ")
    print("=====================================================================")

if __name__ == "__main__":
    main()
