# Avisa API — dump completo da coleção (export oficial 2026-07-22)

Gerado de `docs/Avisa API.postman_collection.json` (64 requests). Auth **Bearer `{{seutoken}}`**, base `{{baseurl}}`, **240 req/min**, conexão **QR** (não-oficial/Baileys). Exemplos base64 gigantes truncados.


## Messages

## Messages / Download Media

### Download Image
`POST {{baseurl}}/message/download/image`

```json
{
  "Url": "string",
  "DirectPath": "string",
  "MediaKey": "string",
  "Mimetype": "string",
  "FileEncSHA256": "string",
  "FileSHA256": "string",
  "FileLength": 0
}
```

### Download Video
`POST {{baseurl}}/message/download/video`

```json
{
  "Url": "string",
  "DirectPath": "string",
  "MediaKey": "string",
  "Mimetype": "string",
  "FileEncSHA256": "string",
  "FileSHA256": "string",
  "FileLength": 0
}
```

### Download Audio
`POST {{baseurl}}/message/download/audio`

```json
{
  "Url": "string",
  "DirectPath": "string",
  "MediaKey": "string",
  "Mimetype": "string",
  "FileEncSHA256": "string",
  "FileSHA256": "string",
  "FileLength": 0
}
```

### Download Document
`POST {{baseurl}}/message/download/document`

```json
{
  "Url": "string",
  "DirectPath": "string",
  "MediaKey": "string",
  "Mimetype": "string",
  "FileEncSHA256": "string",
  "FileSHA256": "string",
  "FileLength": 0
}
```

### Send Text Message
`POST {{baseurl}}/actions/sendMessage`

Envia uma mensagem de texto.

Telefone e Corpo da mensagem são obrigatórios.

Se nenhum ID for fornecido, um aleatório será gerado.

ContextInfo é opcional e usado ao responder a alguma mensagem. StanzaId é o ID da mensagem à qual estamos respondendo e o participante que a escreveu. Se estiver enviando uma nova mensagem, ContextInfo pode ser omitido completamente.  
  
**Em caso de Reply não enviar id.**

```json
{
    "number": "5499999999",
    "message": "Sua mensagem aqui"
    // "id": "ABCDABCD1234",
    // "contextInfo": {
    //     "StanzaId": "3A77FC4B245366E4B9C7",
    //     "Participant": "12345@s.whatsapp.net"
    // }
}
```

### Send Text Message International
`POST {{baseurl}}/actions/sendMessageInternational`

```json
{
    "number": "5551999999999",
    "message": "Your message here"
  
}
```

### Edit Message
`POST {{baseurl}}/actions/editMessage`

```json
{
    "number": "5551999999999",
    "id": "ID_DA_MENSAGEM",
    "message": "Nova mensagem editada"
}
```

### Mark Read Message
`POST {{baseurl}}/actions/markreadMessage`

```json
{
    "sender": "551199999999@s.whatsapp.net",
    "chat": "551199999999@s.whatsapp.net",
    "id": ["3EB04A1CEAC0...ids"]
}
```

### React Message
`POST {{baseurl}}/actions/reactMessage`

number, react, isFromMe, participant and id are mandatory.  
To remove a reaction, pass an empty "react" or remove.  
Body should contain the reaction emoji only.  
When reacting to a group message not sent by you, you must pass "participant" (the JID of the original sender).  
Set isFromMe = true when reacting to your own message; otherwise set it to false.

```json
{
    "number": "551199999999", //chat number
    "react": "❤️",
    "id": "3EB04A1CEAC0...id",
    "isFromMe": false,
    "participant": "551199999999" // message owner
}
```

### Send Media
`POST {{baseurl}}/actions/sendMedia`

Exemplos para serem usados

Vídeo

[https://www.avisaapi.com.br/exemplos/teste.mp4](https://www.avisaapi.com.br/exemplos/teste.mp4)

Documento

[https://www.avisaapi.com.br/exemplos/teste.pdf](https://www.avisaapi.com.br/exemplos/teste.pdf)

Imagem

[https://www.avisaapi.com.br/exemplos/imagem.png](https://www.avisaapi.com.br/exemplos/imagem.png)

Áudio

[https://www.avisaapi.com.br/exemplos/exemplo.ogg](https://www.avisaapi.com.br/exemplos/exemplo.ogg)

```json
{
    "number": "5551999999999",
    "fileUrl": "https://www.avisaapp.com.br/site/oficial/logo.png",
    "message": "Legenda da mensagem",
    "type": "image", // "image,video,audio,document"
    "fileName": "name.jpg" //

}
```

### Send Document - Base64
`POST {{baseurl}}/actions/sendDocument`

```json
{
    "number": "5551999999999",
    "document": "data:application/pdf;base64,JVBERi0xLjUNCiW1tbW1DQoxIDAgb2JqDQo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvTGFuZyhwdC1CUikgL1N0cnVjdFRyZWVSb290IDEwIDAgUi9NYXJrSW5mbzw8L01hcmtlZCB0cnVlPj4+Pg0KZW5kb2JqDQoyIDAgb2JqDQo8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1sgMyAwIFJdID4+DQplbmRvYmoNCjMgMCBvYmoNCjw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4vRXh0R1N0YXRlPDwvR1M3IDcgMCBSL0dTOCA4IDAgUj4+L1Byb2NTZXRbL1BERi9UZXh0L0ltYWdlQi9JbWFnZUMvSW1hZ2VJXSA+Pi9NZWRpYUJveFsgMCAwIDU5NS4zMiA4NDEuOTJdIC9Db250ZW50cyA0IDAgUi9Hcm91cDw8L1R5cGUvR3JvdXAvUy9UcmFuc3BhcmVuY3kvQ1MvRGV2aWNlUkdCPj4vVGFicy9TL1N0cnVjdFBhcmVudHMgMD4+DQplbmRvYmoNCjQgMCBvYmoNCjw8L0ZpbHRlci9GbGF0ZURlY29kZS9MZW5ndGggMTc0Pj4NCnN0cmVhbQ0KeJytjjsLgzAAhPdA/sONpmBM4isBcfBJC4KlQofSrdal9rn05zeKi3tvu+O4++C1SBKvybcFRJoiK3K8KBFcTNI6lhAITch9BR1IbhTePSXHDe6UZB0lXiWhbB6hu1IytQVsokIeSMSh4EqhG22vPsQYPnYaw+z04mpKTk757VngjM/bA8w1zqVHy1zfKSp2RrejpLRPe0r+QOZHhpsV2Qy0cGD9h7LJ8QNExTk5DQplbmRzdHJlYW0NCmVuZG9iag0KNSAwIG9iag0KPDwvVHlwZS9Gb250L1N1YnR5cGUvVHJ1ZVR5cGUvTmFtZS9GMS9CYXNlRm9udC9BQkNERUUrQ2FsaWJyaS9FbmNvZGluZy9XaW5BbnNpRW5jb2RpbmcvRm9udERlc2NyaXB0b3IgNiAwIFIvRmlyc3RDaGFyIDMyL0xhc3RDaGFyIDEyMC9XaWR0aHMgMTcgMCBSPj4NCmVuZG9iag0KNiAwIG9iag0KPDwvVHlwZS9Gb250RGVzY3JpcHRvci9Gb250TmFtZS9BQkNERUUrQ2FsaWJyaS9GbGFncyAzMi9JdGFsaWNBbmdsZSAwL0FzY2VudCA3NTAvRGVzY2VudCAtMjUwL0NhcEhlaWdodCA3NTAvQXZnV2lkdGggNTIxL01heFdpZHRoIDE3NDMvRm9udFdlaWdodCA0MDAvWEhlaWdodCAyNTAvU3RlbVYgNTIvRm9udEJCb3hbIC01MDMgLTI1MC
… [CORPO GRANDE COM BASE64 TRUNCADO — 242938 chars no total] …
```

### Send Image - Base64
`POST {{baseurl}}/actions/sendImage`

```json
{
    "number": "5551999999999",
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA0sAAAFjCAYAAADsJJAEAAAACXBIWXMAAAsSAAALEgHS3X78AAAgAElEQVR4nO3dT1IcR/434O/8YvbSnEB4w4oIaU4gfAIzJ3B7xa7NRB/ApQN0DO4dK6MTGJ3ArRMMRLBiM+gErzmB3kUlFpYTqK7K6qrufp4IQjOGysqG/pOf/Pu3z58/BwAAAH/2f0NXAAAAYIyEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADI+PvQFWC7zBexFxF7EfEmIl6mrzcDVqmpZURczqZxMXRFAAAYh799/vx56DqwoeaLeBkRh1GHoft/XwxYpRLuIuJ0No1q6IoAADAsYYmVpJGjo/T1dtja9OoqIg5n0/h96IoAADAM0/B4VhpBOoqIk4h4PXB11uV1RFxEPWIGAMAOMrLEo9IoUhV1UNr06XVt/cs6JgCA3WRkib+YL+Iw6pC0zdPsmjqKEJYAAHaRsMQf0kjSaUR8N3BVxmRv6AoAADAMYYn7NUlVRPw4cFXGqNXo2v718VF82TJ9eXNwtixWIwAA1sKapR03X8Qk6tGkXV2T9Jy
… [CORPO GRANDE COM BASE64 TRUNCADO — 15747 chars no total] …
```

### Send Audio Ogg - Base64
`POST {{baseurl}}/actions/sendAudio`

```json
{
    "number": "5551999999999",
    "audio": "T2dnUwACAAAAAAAAAABkAA..." // send plain text - https://base64.guru/converter/encode/audio/ogg
}
```

### Send Preview
`POST {{baseurl}}/actions/sendPreview`

```json
{
    "number": "5551999999999",
    "message": "This is a test message with a link preview https://www.google.com", // with a  link
    "urlSite": "https://www.google.com",
    "description": "Descrição do preview",
    "title": "Title preview",
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA0sAAAFjCAYAAADsJJAEAAAACXBIWXMAAAsSAAALEgHS3X78AAAgAElEQVR4nO3dT1IcR/434O/8YvbSnEB4w4oIaU4gfAIzJ3B7xa7NRB/ApQN0DO4dK6MTGJ3ArRMMRLBiM+gErzmB3kUlFpYTqK7K6qrufp4IQjOGysqG/pOf/Pu3z58/BwAAAH/2f0NXAAAAYIyEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADIEJYAAAAyhCUAAIAMYQkAACBDWAIAAMgQlgAAADKEJQAAgAxhCQAAIENYAgAAyBCWAAAAMoQlAACADGEJAAAgQ1gCAADI+PvQFWC7zBexFxF7EfEmIl6mrzcDVqmpZURczqZxMXRFAAAYh799/vx56DqwoeaLeBkRh1GHoft/XwxYpRLuIuJ0No1q6IoAADAsYYmVpJGjo/T1d
… [CORPO GRANDE COM BASE64 TRUNCADO — 15967 chars no total] …
```

### Send Location
`POST {{baseurl}}/actions/sendLocation`

```json
{
    "number": "5551999999999@s.whatsapp.net",
    "name": "Nome do Local",
    "latitude": -23.557217309110108,
    "longitude": -46.62207837231058
}
```

### Send Contact
`POST {{baseurl}}/actions/sendContact`

```json
{
  "number": "5554999999999",
  "vcard": {
    "FullName": "Avisa API",
    "Phone": "555197059343",
    "Organization": "Empresa Avisa API"
  }
}
```

### Delete Message
`POST {{baseurl}}/actions/deleteMessage`

```json
{
    "number": "5551999999999",
    "id": "3EB0BAE1C2049C5BA919D5"
}
```

## Instance

## Instance / Integration (need special token)

### Delete User
`DELETE {{baseurl}}/instance/deleteUser`

```json
{
    "email": "email@example.com"
}
```

### Create User
`POST {{baseurl}}/instance/createUser`

```json
{
    "name": "Nome do Usuário",
    "email": "email@example.com"
}
```

### Get All Users
`GET {{baseurl}}/instance/getAll`

_(sem corpo)_

### Get QR
`GET {{baseurl}}/instance/qr`

_(sem corpo)_

### Instance Status
`GET {{baseurl}}/instance/status`

_(sem corpo)_

### Delete Instance
`DELETE {{baseurl}}/instance/user`

_(sem corpo)_

## Groups

### List Groups
`GET {{baseurl}}/group/list`

_(sem corpo)_

### Info Group
`POST {{baseurl}}/group/info`

Retrieves information about a specific group

```json
{
    "groupId": "5551999999999@g.us"
}
```

### Send Text
`POST {{baseurl}}/actions/sendMessageGroup`

```json
{
    "groupId": "5551999999999@g.us", // JID Group 
    "message": "Sua mensagem aqui"
}
```

### Create Group
`POST {{baseurl}}/group/create`

```json
{
    "name": "Name from group", 
    "participants": [
        "5551999999999@s.whatsapp.net",
        "5554999999999@s.whatsapp.net"
    ]
}
```

### Update Group
`POST {{baseurl}}/group/update`

Can be used to modify group members in a WhatsApp group.  
  
allowed actions are add, remove, promote, demote.

```json
{
    "groupId": "5551999999999@g.us", 
    "participants": [
        "5551999999999@s.whatsapp.net"
    ],
    "action": "add" // add, remove, promote, demote.
}
```

### Change Name Group
`POST {{baseurl}}/group/name`

Allows you to change a group name

```json
{
    "groupId": "5551999999999@g.us", 
    "name": "Novo nome do grupo" 
}
```

### Change Description Group
`POST {{baseurl}}/group/description`

Update group description by group jid

```json
{
    "groupId": "5551999999999@g.us", 
    "description": "Novo descrição do grupo" 
}
```

### Admin Only Send Group
`POST {{baseurl}}/group/adminonly`

Change group announce permission so only admins can send message

```json
{
    "groupId": "5551999999999@g.us", 
    "onlyAdmin": true 
}
```

### Change Group Photo
`POST {{baseurl}}/group/photo`

```json
{
    // imagem precisa ser JPEG e deve ser na resolução 500x500 - OBRIGATÓRIO
    "groupId": "5551999999999@g.us",
    "image": "data:image/jpeg;base64,iVBORw0KGgoAA"
}
```

## Webhook

### Show Webhook
`GET {{baseurl}}/webhook`

_(sem corpo)_

### Set Webhook
`POST {{baseurl}}/webhook`

```json
{
    "webhook": "https://seu-webhook.com/endpoint" // to remove send blank
}
```

## Validation

### Check Number
`POST {{baseurl}}/actions/checknumber`

```json
{
    "number": "(51) 9999-99999"
}
```

### Check Number International
`POST {{baseurl}}/actions/checknumberinternational`

```json
{
    "number": "+5554999999999"
}
```

## Chat

### Chat archive
`POST {{baseurl}}/chat/archive`

```json
{
    "chat": "5551999999999@s.whatsapp.net"
}
```

### Chat Disappearing Timer
`POST {{baseurl}}/chat/disappearing-timer`

```json
{
    "phone": "1276543210",
    "timer": "24h"
}
```

### Chat Typing Start
`POST {{baseurl}}/chat/typing/start`

```json
{
    "chat": "5551999999999@s.whatsapp.net"
}
```

### Chat Typing Stop
`POST {{baseurl}}/chat/typing/stop`

```json
{
    "chat": "5551999999999@s.whatsapp.net"
}
```

### Chat Recording Start
`POST {{baseurl}}/chat/recording/start`

```json
{
    "chat": "5551999999999@s.whatsapp.net"
}
```

### Chat Recording Stop
`POST {{baseurl}}/chat/recording/stop`

```json
{
    "chat": "5551999999999@s.whatsapp.net"
}
```

## Label

### Add Label
`POST {{baseurl}}/label/chat`

```json
{
    "jid": "5551999999999@s.whatsapp.net",
    "labelId": 2
}
```

### UnLabel
`POST {{baseurl}}/unlabel/chat`

```json
{
    "jid": "555199999999@s.whatsapp.net",
    "labelId": 1
}
```

## Messages Async

### Send Text Message Async
`POST {{baseurl}}/actions/sendMessageAsync`

Mensagem será enviada de forma assincrona.  
A cada 5 minutos as mensagens são processadas e enviadas com intervalo de 3 segundos.

```json
{
    "number": "555199999999",
    "message": "Sua mensagem aqui"
}
```

### Get Message Async
`GET {{baseurl}}/actions/getSendMessageAsync?id=1`

_(sem corpo)_

## Button - new

### Send List
`POST {{baseurl}}/actions/sendList`

```json
{
    "number": "555199999999",
    "buttontext": "Sua mensagem aqui",
    "desc": "This is a list",
    "toptext": "This is a list top", // opcional
    "list": [
        {
            "title": "menu button 1",
            "desc": "long description ", //opcional
            "RowId": "1"
        },
        {
            "title": "menu button 2",
            "desc": "very good description ",
            "RowId": "2"
        }
    ]
}
```

### Send Template
`POST {{baseurl}}/actions/template`

```json
{
    "number": "555199999999",
    "title": "Sua mensagem aqui",
    "desc": "This is a desc",
    "footer": "This is a footer", // opcional
    "buttons": [
         {
            "DisplayText": "tap to copy",
            "Type": "copy",
            "Id": "hello 👋"
        },
        {
            "DisplayText": "Visit Site",
            "Type": "url",
            "Url": "https://www.avisaapi.com.br"
        },
        {
            "DisplayText": "Callme",
            "Type": "call",
            "PhoneNumber": "91123811298"
        }
    ]
}
```

### Send Buttons
`POST {{baseurl}}/actions/buttons`

```json
{
    "number": "555199999999",
    "title": "Sua mensagem aqui",
    "desc": "This is a desc",
    "footer": "This is a footer", // opcional
    "buttons": [
        {
            "id": "btn1",
            "text": "long description "
        },
        {
            "id": "btn2",
            "text": "very good description "
        }
    ]
}
```

### Send Buttons Media
`POST {{baseurl}}/actions/mediabutton`

```json
{
    "number": "555199999999",
    "title": "Sua mensagem aqui",
    "buttons": [
         {
            "DisplayText": "Call Now",
            "Type": "call",
            "phonenumber": "123456789"
        },
        {
            "DisplayText": "Visit Now",
            "Type": "url",
            "url": "https://avisaapi.com.br"
        },
        {
            "DisplayText": "Not Interested",
            "Type": "quickreply",
            "id": "btn2"
        }
    ],
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAApIAAACTCAMAAAAKlQnYAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAABmUExURf///4yR/4yR/4yR/4yR/4yR/4yR/4yR/4yR/4yR/4yR/4yR/4yR/4yR/yXTZiXTZiXTZiXTZiXTZiXTZiXTZoyR/yXTZoyR/yXTZiXTZiXTZiXTZiXTZiXTZiXTZoyR/yXTZv///ySi4+QAAAAfdFJOUwAgQICwwJBgEFBw0KDwUIAQ8DDgwDBg4JCgsHBAINDMgmZyAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAALEgAACxIB0t1+/AAAAAd0SU1FB+kCAxEZCWrSxJ8AAAABb3JOVAHPoneaAAATdElEQVR42u1d21bjOgylSdOkt6EFQmaGw9D//8pDaRPbsmTLN5qytB8pcWxlW7ZkSX54EAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEgvJYVHW9bLhYtd2tOyz4wejWq+YjGCshpaAIFpttOB2/sBVOCrKji+bjFydv3X3BT8Nil8DHM9pbj0Dwo1BF7B8Blrceg+AHYbFMJuTHx/7WoxD8GHSrDIT8hNHor8fHX4dbj0xwn2j3eRipacnD4/H0iePj4daDE9wfFumbyCt2U5tPz6crnp9uPT7BvWGdSUV+ohrbfDqeFB5vPULBXaFLdfxoqKdWX046Xg63HqXgftCnuMZJRj6dTBxl8RYwUeVbtJtKNft4gni99UgF94GWQbWhaVZ1XW8qHfUVq2sg0G6z0Nu1KXn6feuxCu4BbmfksKzXVVwkBULJ059bj1YwfzgMm2G1TgnreT0JJwXhIBk51H1i04ejcFIQDIqRuyq9bXTlFk4KnKgJQi7Smz7jRTgpCENblJCfS/dflJNvtx63YK7oMUJucyzZE/C1+9etR87Cor4e+w9ZtjE/Ed3mKqL9Mkvgdod5y
… [CORPO GRANDE COM BASE64 TRUNCADO — 7786 chars no total] …
```

### Send Carousel Media
`POST {{baseurl}}/actions/carouselmedia`

Não funciona no WhatsApp Web, apenas no telefone.

```json
{
    "number": "555199999999",
    "message": "Sua mensagem aqui",
    "carousel": [
   {
      "text": "Card 1",
      "media_url": "https://picsum.photos/536/354",
      "media_type": "image",
      "buttons": [
        {
          "id": "1",
          "label": "check our site",
          "url": "https://avisaapi.com.br",
          "type": "url"
        },
        {
          "id": "2",
          "label": "interested",
          "type": "reply"
        }
      ]
    },
    {
      "text": "Card 2",
      "media_url": "https://filesamples.com/samples/video/mp4/sample_960x540.mp4",
      "media_type": "video",
      "buttons": [
        {
          "id": "123456789",
          "label": "call us",
          "type": "call"
        },
        {
          "id": "123456789792938",
          "label": "copy our number",
          "type": "copy"
        }
      ]
    }
    ]
}
```

### Pix Button
`POST {{baseurl}}/buttons/pix`

```json
{
    "number": "555199999999",
    "pix": "Seu Código PIX aqui"
}
```

### Location Button
`POST {{baseurl}}/actions/locationButton`

```json
{
    "number": "555199999999",
    "message": "Por favor, clique no botão para enviar sua localização"
}
```

## User

### Parse LID
`POST {{baseurl}}/user/parselid`

```json
{
    "lid": "135536433952222@lid"
}
```

### Get Avatar
`POST {{baseurl}}/user/avatar`

```json
{
    "number": "9876543210",
    "preview": true
}
```

### Get All Contacts
`GET {{baseurl}}/user/contacts`

Gets complete list of contacts for the connected account

_(sem corpo)_

## Contact

### Contact Add
`POST {{baseurl}}/contact/add`

```json
{
    "number": "+5551999999999",
    "name": "Nome",
    "fullName": "Nome Completo"
}
```

### Contact Remove
`POST {{baseurl}}/contact/remove`

```json
{
    "number": "+5551999999999"
}
```

## Status

### Image
`POST {{baseurl}}/status/image`

```json
{
    //ATENÇÃ0!! ESSE ENDPOINT DEMORA BEM MAIS QUE O NORMAL PARA RETORNAR
    "image": "data:image/jpeg;base64,Akd9300...",
    "caption": "Mensagem"
}
```

## Business

### Catalog List Get Full
`POST {{baseurl}}/business/catalog/list`

```json
{
  "jid": "555198999999@s.whatsapp.net"
}                  
```

### Get Product from Catalog
`POST {{baseurl}}/business/catalog/info`

```json
{
  "jid": "555198999999@s.whatsapp.net",
  "id": "3164974523"
}
```

## Community

### Create Community
`POST {{baseurl}}/community/create`

```json
{
    "name": "Name from community"
}
```

### Add Group to Community
`POST {{baseurl}}/community/add`

```json
{
    "communityJID": "12323811298@g.us", 
    "groupJID": [
        "12323811298@g.us",
        "12323811298@g.us"
    ]
}
```

### Remove Group to Community
`POST {{baseurl}}/community/remove`

```json
{
    "communityJID": "12323811298@g.us", 
    "groupJID": [
        "12323811298@g.us",
        "12323811298@g.us"
    ]
}
```
