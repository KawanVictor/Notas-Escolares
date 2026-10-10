n = int(input())

acervo = {}

for _ in range(n):
    
    linha = input().strip()
    titulo, codigo = linha.split()
    
    acervo[titulo] = codigo

consulta = input().strip()


if consulta in acervo:
    print(acervo[consulta])

else:
    print("Livro nao encontrado")