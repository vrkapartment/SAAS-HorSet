/**
 * ดักจับพารามิเตอร์จาก URL ของหน้าที่เปิดผ่าน LINE LIFF
 *
 * LIFF ไม่ได้ส่ง query string ตรง ๆ เสมอ — เวลาผู้ใช้ยังไม่ได้ล็อกอินหรือเปิดจาก rich menu
 * LINE จะห่อพารามิเตอร์เดิมไว้ใน `liff.state` (ทั้งใน search และใน hash) แล้วค่อยเด้งกลับมา
 * ฟังก์ชันนี้จึงต้องงัดค่าออกมาจากทุกที่ที่ LINE เคยเอาไปซ่อนไว้
 */
export function getLiffUrlParam(name: string): string {
  if (typeof window === "undefined") return ""

  // 1. ดักจับจาก URL Search ปกติ
  const searchParams = new URLSearchParams(window.location.search)
  const val = searchParams.get(name)
  if (val) return val

  // 2. ดึงค่า liff.state จาก URL Search หรือ Hash
  let liffState = searchParams.get("liff.state")
  if (!liffState) {
    const hash = window.location.hash
    if (hash) {
      // ค้นหา liff.state= ใน hash เช่น #liff.state=... หรือ #/path?liff.state=...
      const stateMatch = hash.match(/liff\.state=([^&]+)/)
      if (stateMatch) {
        liffState = stateMatch[1]
      }
    }
  }

  // 3. ถ้าเจอ liff.state ให้ทำการแกะพารามิเตอร์ข้างใน
  if (liffState) {
    try {
      const decodedState = decodeURIComponent(liffState)
      // กรณีเป็น query string เช่น /tenant-register?workspace_id=...&room_number=...
      if (decodedState.includes("?")) {
        const innerQuery = decodedState.substring(decodedState.indexOf("?"))
        const innerParams = new URLSearchParams(innerQuery)
        const innerVal = innerParams.get(name)
        if (innerVal) return innerVal
      } else if (decodedState.includes(`${name}=`)) {
        // เผื่อไม่มีเครื่องหมายคำถามแต่มีคีย์-ค่า คั่นด้วย &
        const innerParams = new URLSearchParams(decodedState)
        const innerVal = innerParams.get(name)
        if (innerVal) return innerVal
      } else {
        // กรณีเป็น JSON String
        const parsed = JSON.parse(decodedState)
        if (parsed[name]) return String(parsed[name])
      }
    } catch (e) {
      console.error(`Error parsing liff.state for ${name}:`, e)
    }
  }

  // 4. ดักจับเพิ่มเติมหากมี ? ปนใน hash ทั่วไป
  const hash = window.location.hash
  if (hash && hash.includes("?")) {
    const hashQuery = hash.substring(hash.indexOf("?"))
    const hashParams = new URLSearchParams(hashQuery)
    const hashVal = hashParams.get(name)
    if (hashVal) return hashVal
  }

  return ""
}
