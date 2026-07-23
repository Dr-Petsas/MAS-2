from PIL import Image
p=r'F:\MAS-2\backend\public\m\lena-01\_sil_check.png'
im=Image.open(p)
im.crop((80,300,520,520)).resize((440*2,220*2)).save(r'F:\MAS-2\backend\scripts\_sil_lo.png')
im.crop((80,90,520,260)).resize((440*2,170*2)).save(r'F:\MAS-2\backend\scripts\_sil_up.png')
print('ok')
