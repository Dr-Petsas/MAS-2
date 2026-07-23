from PIL import Image
p=r'C:\Users\Anmeldung2\.cursor\projects\f-pickadoc-live-base\assets\c__Users_Anmeldung2_AppData_Roaming_Cursor_User_workspaceStorage_2a5a96aac29a1ddad1f8af43197731ba_images_image-a0a5e0fd-493e-405e-a07f-c5294cf24cbf.png'
im=Image.open(p).convert('RGB')
print(im.size)
# lower jaw region
c=im.crop((120,300,745,470)).resize((625*2,170*2))
c.save(r'F:\MAS-2\backend\scripts\_lo_zoom.png')
