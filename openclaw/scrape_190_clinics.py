import os
import sys
import time
import argparse

# Ensure current directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from run_scout import run_scout_pipeline

def run_safe_scout(query, limit, lang, types, override_specialty=None):
    print(f"\n>>> Dang chay: query='{query}', limit={limit}, lang={lang}, types={types}, override_specialty={override_specialty}")
    try:
        run_scout_pipeline(
            query=query,
            limit=limit,
            required_languages=lang,
            included_types=types,
            override_specialty=override_specialty
        )
    except Exception as e:
        print(f"[!] Loi khi chay scout cho '{query}': {e}")
    # Cho 2 giay de tranh spam API
    time.sleep(2)

def main():
    parser = argparse.ArgumentParser(description="Scrape 190 Asian language-supporting clinics/hospitals.")
    parser.add_argument("--dry-run", action="store_true", help="Chay thu 1-2 query voi limit 1 de kiem tra logic.")
    args = parser.parse_args()

    if args.dry_run:
        print("=====================================================================")
        print(" [DRY RUN] Bat dau chay thu nghiem logic cao ")
        print("=====================================================================\n")
        # Run 1 city query
        run_safe_scout("Vietnamese speaking medical clinic in Sacramento, CA", limit=1, lang=["Vietnamese"], types=["medical_clinic"])
        # Run 1 specialty query with override
        run_safe_scout("Korean pediatric clinic in Los Angeles, CA", limit=1, lang=["Korean"], types=["medical_clinic"], override_specialty="Pediatrics")
        print("\n=====================================================================")
        print(" [DRY RUN] Hoan tat chay thu nghiem! ")
        print("=====================================================================")
        return

    print("=====================================================================")
    print(" Bat dau tien trinh cao 190 phong kham/benh vien ")
    print("=====================================================================\n")

    # ==========================================
    # PHASE 1: 100 Clinics tai 10 Thanh pho lon
    # ==========================================
    cities = [
        ("Los Angeles, CA", ["medical_clinic"]),
        ("Houston, TX", ["medical_clinic"]),
        ("San Jose, CA", ["medical_clinic"]),
        ("Dallas, TX", ["medical_clinic"]),
        ("San Francisco, CA", ["medical_clinic"]),
        ("Seattle, WA", ["medical_clinic"]),
        ("Washington, D.C.", ["medical_clinic"]),
        ("San Diego, CA", ["medical_clinic"]),
        ("Atlanta, GA", ["medical_clinic"]),
        ("Sacramento, CA", ["medical_clinic"])
    ]

    print("=== STARTING PHASE 1: 100 CLINICS IN 10 CITIES ===")
    for city, types in cities:
        print(f"\n--- CITY: {city} (Goal: 10 clinics) ---")
        # Vietnamese: 4 clinics
        run_safe_scout(f"Vietnamese speaking medical clinic in {city}", limit=4, lang=["Vietnamese"], types=types)
        # Korean: 3 clinics
        run_safe_scout(f"Korean speaking medical clinic in {city}", limit=3, lang=["Korean"], types=types)
        # Chinese: 3 clinics
        run_safe_scout(f"Chinese speaking medical clinic in {city}", limit=3, lang=["Chinese"], types=types)

    # ==========================================
    # PHASE 2: 90 Clinics cho 9 Chuyen khoa
    # ==========================================
    print("\n\n=== STARTING PHASE 2: 90 CLINICS FOR 9 SPECIALTIES ===")
    
    # 1. Primary Care (10 clinics)
    print("\n--- Specialty: Primary Care (10 clinics) ---")
    run_safe_scout("Vietnamese primary care clinic in Orange County, CA", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Primary Care")
    run_safe_scout("Korean primary care clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Primary Care")
    run_safe_scout("Chinese primary care clinic in San Francisco, CA", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Primary Care")

    # 2. Dental (10 clinics)
    print("\n--- Specialty: Dental (10 clinics) ---")
    run_safe_scout("Vietnamese dentist in San Jose, CA", limit=4, lang=["Vietnamese"], types=["dental_clinic"], override_specialty="Dental")
    run_safe_scout("Korean dentist in Los Angeles, CA", limit=3, lang=["Korean"], types=["dental_clinic"], override_specialty="Dental")
    run_safe_scout("Chinese dentist in New York, NY", limit=3, lang=["Chinese"], types=["dental_clinic"], override_specialty="Dental")

    # 3. Mental Health (10 clinics)
    print("\n--- Specialty: Mental Health (10 clinics) ---")
    run_safe_scout("Vietnamese mental health counseling in Orange County, CA", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Mental Health")
    run_safe_scout("Korean counseling clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Mental Health")
    run_safe_scout("Chinese mental health clinic in San Francisco, CA", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Mental Health")

    # 4. OB/GYN (10 clinics)
    print("\n--- Specialty: OB/GYN (10 clinics) ---")
    run_safe_scout("Vietnamese OB/GYN clinic in Houston, TX", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="OB/GYN")
    run_safe_scout("Korean OB/GYN clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="OB/GYN")
    run_safe_scout("Chinese OB/GYN clinic in San Francisco, CA", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="OB/GYN")

    # 5. Ophthalmology (10 clinics)
    print("\n--- Specialty: Ophthalmology (10 clinics) ---")
    run_safe_scout("Vietnamese eye clinic in San Jose, CA", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Ophthalmology")
    run_safe_scout("Korean ophthalmology clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Ophthalmology")
    run_safe_scout("Chinese eye clinic in New York, NY", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Ophthalmology")

    # 6. Cardiology (10 clinics)
    print("\n--- Specialty: Cardiology (10 clinics) ---")
    run_safe_scout("Vietnamese cardiologist in Houston, TX", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Cardiology")
    run_safe_scout("Korean cardiology clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Cardiology")
    run_safe_scout("Chinese cardiology clinic in San Francisco, CA", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Cardiology")

    # 7. Dermatology (10 clinics)
    print("\n--- Specialty: Dermatology (10 clinics) ---")
    run_safe_scout("Vietnamese dermatologist clinic in Orange County, CA", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Dermatology")
    run_safe_scout("Korean dermatology clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Dermatology")
    run_safe_scout("Chinese dermatology clinic in New York, NY", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Dermatology")

    # 8. Orthopedics (10 clinics)
    print("\n--- Specialty: Orthopedics (10 clinics) ---")
    run_safe_scout("Vietnamese orthopedic clinic in Houston, TX", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Orthopedics")
    run_safe_scout("Korean orthopedic clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Orthopedics")
    run_safe_scout("Chinese orthopedic clinic in San Francisco, CA", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Orthopedics")

    # 9. Pediatrics (10 clinics)
    print("\n--- Specialty: Pediatrics (10 clinics) ---")
    run_safe_scout("Vietnamese pediatric clinic in Orange County, CA", limit=4, lang=["Vietnamese"], types=["medical_clinic"], override_specialty="Pediatrics")
    run_safe_scout("Korean pediatric clinic in Los Angeles, CA", limit=3, lang=["Korean"], types=["medical_clinic"], override_specialty="Pediatrics")
    run_safe_scout("Chinese pediatric clinic in San Francisco, CA", limit=3, lang=["Chinese"], types=["medical_clinic"], override_specialty="Pediatrics")

    print("\n=====================================================================")
    print(" Hoan tat tien trinh cao tat ca 190 phong kham/benh vien! ")
    print("=====================================================================")

if __name__ == "__main__":
    main()
