from PIL import Image
p=r'C:\Users\Anmeldung2\.cursor\projects\f-pickadoc-live-base\assets\c__Users_Anmeldung2_AppData_Roaming_Cursor_User_workspaceStorage_2a5a96aac29a1ddad1f8af43197731ba_images_image-a0a5e0fd-493e-405e-a07f-c5294cf24cbf.png'
im=Image.open(p).convert('RGB')
# Q4 far left lower
im.crop((150,310,420,470)).resize((270*4,160*4)).save(r'F:\MAS-2\backend\scripts\_q4.png')
# whole lower with labels, wider
im.crop((120,300,745,475)).resize((625*3,175*3)).save(r'F:\MAS-2\backend\scripts\_lowfull.png')
print('ok')
