import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import { publicDecrypt } from 'crypto';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerFound = await this.customersRepository.findById(customer_id);

    // should not be able to create an order with a invalid customer
    if (!customerFound) {
      throw new AppError('Could not find any customer with the given id.');
    }

    // should not be able to create an order with invalid products
    const productsFound = await this.productsRepository.findAllById(products);

    if (!productsFound.length) {
      throw new AppError('Could not find any product with the given ids.');
    }

    const foundProductsIDs = productsFound.map(product => product.id);

    const checkProductsNotFound = products.filter(
      product => !foundProductsIDs.includes(product.id),
    );

    if (checkProductsNotFound.length) {
      throw new AppError(
        `Could not find product ${checkProductsNotFound[0].id}`,
      );
    }

    // should not be able to create an order with products with insufficient quantities
    const productsWithNotAvailableQuantity = products.filter(
      product =>
        productsFound.filter(prod => prod.id === product.id)[0].quantity <
        product.quantity,
    );

    if (productsWithNotAvailableQuantity.length) {
      throw new AppError('Product with no available quantity.');
    }

    // Saving
    const serializedProducts = products.map(prod => ({
      product_id: prod.id,
      quantity: prod.quantity,
      price: productsFound.filter(p => p.id === prod.id)[0].price,
    }));

    const newOrder = this.ordersRepository.create({
      customer: customerFound,
      products: serializedProducts,
    });

    const productsOrderedQuantity = products.map(product => ({
      id: product.id,
      quantity:
        productsFound.filter(p => p.id === product.id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(productsOrderedQuantity);

    return newOrder;
  }
}

export default CreateOrderService;
