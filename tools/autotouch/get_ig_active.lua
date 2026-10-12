-- Preserve source values; never reconstruct sessionid from guessed fragments.
local IG = "com.burbn.instagram"
local function readFileGlob()
 local h=io.popen("cat /var/mobile/Containers/Data/Application/*/Documents/ig_token.txt 2>/dev/null")
 if not h then return "" end
 local s=h:read("*a");h:close();return s or ""
end
local function getToken()
 for i=1,12 do
  local c=clipText()
  if c and c:find("Bearer IGT:2:",1,true) then return c end
  local f=readFileGlob()
  if f:find("Bearer IGT:2:",1,true) then return f end
  usleep(1000*1000)
 end
 return nil
end
toast("Mo Instagram, lay du lieu xac thuc...",2)
appRun(IG);usleep(3*1000*1000)
local source=getToken()
if not source then alert("Khong lay duoc du lieu xac thuc");return nil end
local line=source:match("[^\r\n]+") or source
local bearer=line:match("(Bearer IGT:2:[^|%s]+)")
local ds=line:match("ds_user_id=(%d+)") or line:match("ds_user_id(%d+);")
local session=line:match("sessionid=([^|;\r\n]+)")
if not bearer or not ds or not session then
 alert("Nguon khong co du cookie/token. Khong tu khoi phuc sessionid.")
 return nil
end
if session:find("[%c%s]") then alert("Sessionid co ky tu khong hop le");return nil end
local i=1
while i<=#session do
 if session:sub(i,i)=="%" then
  if not session:sub(i+1,i+2):match("^%x%x$") then alert("Percent encoding khong hop le");return nil end
  i=i+3
 else i=i+1 end
end
if session:lower():find("0x[%da-f%.]+") then
 log("SESSION_HEX_PATTERN_UNVERIFIED: gia tri duoc giu nguyen, chua xac minh nguon tweak.")
end
local cookies="ds_user_id="..ds.."; sessionid="..session..";"
-- First return remains the cookie string for old callers. Capture second return for token.
-- Never log either value. Clipboard/file may be stale; verify active-account identity upstream.
return cookies,bearer
