from PIL import Image
p=r'C:\Users\Anmeldung2\.cursor\projects\f-pickadoc-live-base\assets\c__Users_Anmeldung2_AppData_Roaming_Cursor_User_workspaceStorage_2a5a96aac29a1ddad1f8af43197731ba_images_image-add6fb60-b7a2-4f63-8288-03974a3c9deb.png'
im=Image.open(p).convert('RGB'); print(im.size)
# lower center region around 41,31,32,33,34
im.crop((360,300,560,470)).resize((200*4,170*4)).save(r'F:\MAS-2\backend\scripts\_z34.png')
