// code 1009/1010 = ข้อมูลจากธนาคารยังไม่เข้าระบบ SlipOK ชั่วคราว ให้ auto-retry ได้ (ไม่ใช่ error ถาวร)
export const SLIPOK_RETRYABLE_ERROR_CODES = [1009, 1010]
